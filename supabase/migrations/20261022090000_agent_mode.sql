-- Phase 9: agent mode (overview §7.14, §10.11).
-- Staff content now needs more than an 'agent' role in the token: the account must still be an
-- agent and not deactivated, the session must have been active in the last 30 minutes, and the
-- authenticator code must be less than 8 hours old. The app checks the same rules
-- (lib/supabase/auth-state.ts); this is the database's own copy, so a token used directly against
-- the API gets nothing more than the app would give it. See docs/security/threat-model.md (E2, S5).

-- ---------------------------------------------------------------------------
-- Agent session activity, for the 30-minute idle timeout.
-- Only the functions below touch it: no table privileges for anon or authenticated.
-- ---------------------------------------------------------------------------
create table public.agent_sessions (
  session_id  uuid primary key,
  user_id     uuid not null,
  last_seen   timestamptz not null default now()
);
create index on public.agent_sessions (user_id);
alter table public.agent_sessions enable row level security;
revoke all on public.agent_sessions from anon, authenticated;

-- The session id from the token, or null.
create or replace function public.jwt_session_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid
$$;

-- True when the authenticator code in this token was entered less than 8 hours ago.
create or replace function public.mfa_is_recent() returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as m
    where m ->> 'method' = 'totp'
      and to_timestamp((m ->> 'timestamp')::double precision) > now() - interval '8 hours'
  )
$$;

-- Whether this request may read staff content. SECURITY DEFINER so it can read auth.users and
-- agent_sessions, which the caller can't; it only ever answers about the caller's own account.
create or replace function public.staff_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_aal2()
    and public.app_role() = 'agent'
    and public.mfa_is_recent()
    -- Still an agent now, and not deactivated: the token's copy of the role can be up to an hour old.
    and exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and u.raw_app_meta_data ->> 'role' = 'agent'
        and (u.banned_until is null or u.banned_until < now())
    )
    and exists (
      select 1 from public.agent_sessions a
      where a.session_id = public.jwt_session_id()
        and a.user_id = auth.uid()
        and a.last_seen > now() - interval '30 minutes'
    )
$$;

-- Called by the app on every signed-in agent request. Records activity, unless the session has
-- already been idle for 30 minutes: then it stays expired and the app signs the user out.
-- Returns 'active', 'idle' or 'not_agent' (no agent role or no MFA in this token).
create or replace function public.touch_agent_session() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session uuid := public.jwt_session_id();
  v_seen timestamptz;
begin
  if not public.is_aal2() or public.app_role() <> 'agent' or v_session is null or auth.uid() is null then
    return 'not_agent';
  end if;
  select last_seen into v_seen from public.agent_sessions where session_id = v_session and user_id = auth.uid();
  if v_seen is not null and v_seen <= now() - interval '30 minutes' then
    return 'idle';
  end if;
  insert into public.agent_sessions (session_id, user_id, last_seen) values (v_session, auth.uid(), now())
  on conflict (session_id) do update set last_seen = now() where public.agent_sessions.user_id = auth.uid();
  -- Housekeeping: this user's rows for sessions that are long gone.
  delete from public.agent_sessions where user_id = auth.uid() and last_seen < now() - interval '1 day';
  return 'active';
end;
$$;

-- Called by the app when an agent signs out, so the token stops reaching staff content at once
-- instead of when it expires.
create or replace function public.end_agent_session() returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.agent_sessions where session_id = public.jwt_session_id() and user_id = auth.uid()
$$;

revoke execute on function public.jwt_session_id(), public.mfa_is_recent(), public.staff_access(),
  public.touch_agent_session(), public.end_agent_session() from public, anon;
grant execute on function public.staff_access(), public.touch_agent_session(), public.end_agent_session() to authenticated;
grant execute on function public.jwt_session_id(), public.mfa_is_recent() to authenticated;

-- ---------------------------------------------------------------------------
-- Staff rows use the new check. `(select ...)` runs it once per query, not once per row.
-- ---------------------------------------------------------------------------
drop policy "read documents by audience" on public.documents;
create policy "read documents by audience" on public.documents
  for select to authenticated
  using (public.is_aal2() and (audience = 'public' or (audience = 'staff' and (select public.staff_access()))));

drop policy "read chunks by audience" on public.document_chunks;
create policy "read chunks by audience" on public.document_chunks
  for select to authenticated
  using (public.is_aal2() and (audience = 'public' or (audience = 'staff' and (select public.staff_access()))));

-- ---------------------------------------------------------------------------
-- Customer-ready wording (US-34), saved with the agent's answer so it shows again in the history.
-- ---------------------------------------------------------------------------
alter table public.messages
  add column customer_wording text check (char_length(customer_wording) <= 4000);
