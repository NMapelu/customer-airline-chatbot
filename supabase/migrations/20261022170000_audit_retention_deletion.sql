-- Phase 10: audit log (overview §10.10), 12-month retention (§11) and account deletion (§11, §12).

-- ---------------------------------------------------------------------------
-- Audit log: append-only. Nobody can read, change or delete entries through the API; the app
-- writes through log_event(), which takes the user from the token, never from the caller.
-- Entries never hold message content, passwords or codes.
-- ---------------------------------------------------------------------------
create type public.audit_event as enum (
  'sign_up', 'email_confirmed', 'sign_in', 'sign_in_failed', 'sign_out',
  'mfa_enrolled', 'mfa_verified', 'mfa_failed', 'mfa_replaced',
  'conversation_deleted', 'account_deleted',
  'rate_limited', 'aal1_rejected',
  'agent_invited', 'agent_deactivated', 'agent_timed_out', 'staff_content_blocked'
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid,
  event       public.audit_event not null,
  -- Truncated by the app (lib/security/client-ip.ts) before it gets here.
  ip          text check (char_length(ip) <= 64),
  detail      text check (char_length(detail) <= 200)
);
create index on public.audit_log (created_at);
create index on public.audit_log (user_id, created_at);
alter table public.audit_log enable row level security;
-- No policies and no privileges: invisible to anon and authenticated users.
revoke all on public.audit_log from anon, authenticated;

-- Events someone can cause before signing in. Anything else needs a signed-in user.
create or replace function public.log_event(p_event public.audit_event, p_ip text default null, p_detail text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null and p_event not in ('sign_up', 'sign_in_failed', 'mfa_failed', 'rate_limited') then
    return;
  end if;
  -- A flood cap: the function is callable by anyone, so a script can't grow the table without bound.
  if (select count(*) from public.audit_log where created_at > now() - interval '1 minute') >= 1000 then
    return;
  end if;
  insert into public.audit_log (user_id, event, ip, detail)
  values (v_user, p_event, left(p_ip, 64), left(p_detail, 200));
end;
$$;

revoke execute on function public.log_event(public.audit_event, text, text) from public;
grant execute on function public.log_event(public.audit_event, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention (§11): conversations 12 months after their last activity, audit entries after
-- 12 months, agent session rows after a day. Runs daily under pg_cron; the function can only
-- delete expired rows and nobody else may call it (§10.0 least privilege).
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired() returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.conversations where updated_at < now() - interval '12 months';
  delete from public.audit_log where created_at < now() - interval '12 months';
  delete from public.agent_sessions where last_seen < now() - interval '1 day';
$$;
revoke execute on function public.purge_expired() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('purge-expired-data', '17 3 * * *', 'select public.purge_expired()');

-- ---------------------------------------------------------------------------
-- Account deletion (§11 user control). The caller must have entered an authenticator code in the
-- last 5 minutes. Deleting the auth user removes their conversations and messages (on delete
-- cascade), authenticators, sessions and identities. Their audit entries are kept for the
-- retention period but no longer point to them. Agent accounts are removed by the administrator.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_aal2() then
    raise exception 'not signed in with an authenticator code' using errcode = '42501';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as m
    where m ->> 'method' = 'totp' and to_timestamp((m ->> 'timestamp')::double precision) > now() - interval '5 minutes'
  ) then
    raise exception 'enter a new authenticator code first' using errcode = '42501';
  end if;
  if exists (select 1 from auth.users where id = v_user and raw_app_meta_data ->> 'role' = 'agent') then
    raise exception 'agent accounts are removed by the administrator' using errcode = '42501';
  end if;

  update public.audit_log set user_id = null where user_id = v_user;
  delete from public.agent_sessions where user_id = v_user;
  delete from auth.users where id = v_user;
  insert into public.audit_log (event) values ('account_deleted');
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
