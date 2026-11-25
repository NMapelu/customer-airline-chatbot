-- Administrator tools: agent accounts, passenger accounts and the audit log, from the /admin pages.
-- The web app still never holds the service-role key: every change runs in these SECURITY DEFINER
-- functions, which check for themselves that the caller is an administrator right now (not just in
-- an older token), signed in with an authenticator code, and that the code is fresh for anything
-- that changes an account. Each change and each audit-log read is written to the audit log.
alter type public.audit_event add value if not exists 'agent_invite_cancelled';
alter type public.audit_event add value if not exists 'agent_joined';
alter type public.audit_event add value if not exists 'account_suspended';
alter type public.audit_event add value if not exists 'account_restored';
alter type public.audit_event add value if not exists 'audit_viewed';

-- ---------------------------------------------------------------------------
-- Checks shared by every admin function
-- ---------------------------------------------------------------------------
-- An administrator now: the token says so, and so does the account itself (the token's copy of the
-- role can be up to an hour old), and the account isn't suspended.
create or replace function public.is_admin_now() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and public.is_aal2()
    and public.app_role() = 'admin'
    and exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and u.raw_app_meta_data ->> 'role' = 'admin'
        and (u.banned_until is null or u.banned_until < now())
    )
$$;

-- True when the token's authenticator code was entered in the last 5 minutes.
create or replace function public.code_is_fresh() returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as m
    where m ->> 'method' = 'totp' and to_timestamp((m ->> 'timestamp')::double precision) > now() - interval '5 minutes'
  )
$$;

create or replace function public.require_admin(p_fresh_code boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin_now() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  if p_fresh_code and not public.code_is_fresh() then
    raise exception 'enter a new authenticator code first' using errcode = 'P0001', hint = 'fresh_code';
  end if;
end;
$$;

-- Shows enough of an email to recognise it, for the audit log: "ne***@gmail.com".
create or replace function public.mask_email(p_email text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_email is null then null
    when position('@' in p_email) = 0 then '***'
    else left(split_part(p_email, '@', 1), 2) || '***@' || split_part(p_email, '@', 2)
  end
$$;

-- Signs an account out everywhere: its refresh tokens go with its sessions, so it can't get a new
-- token, and the app's session check (getUser) fails on the next request.
create or replace function public.end_all_sessions(p_user uuid) returns void
language sql volatile security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_user;
  delete from public.agent_sessions where user_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- Agent invitations. The administrator adds a work email; when that person signs up on the normal
-- sign-up page within 7 days, the account is created as an agent. Only a brand-new account can
-- become an agent this way: an existing passenger account is never turned into one (US-36).
-- ---------------------------------------------------------------------------
create table public.agent_invites (
  email       text primary key check (email = lower(email) and char_length(email) <= 254),
  invited_by  uuid,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days'
);
alter table public.agent_invites enable row level security;
revoke all on public.agent_invites from anon, authenticated;

create or replace function public.apply_agent_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and exists (
    select 1 from public.agent_invites where email = lower(new.email) and expires_at > now()
  ) then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role":"agent"}'::jsonb;
    delete from public.agent_invites where email = lower(new.email);
    insert into public.audit_log (user_id, event, detail) values (new.id, 'agent_joined', 'signed up from an invitation');
  end if;
  return new;
end;
$$;
revoke execute on function public.apply_agent_invite() from public, anon, authenticated;

create trigger apply_agent_invite
  before insert on auth.users
  for each row execute function public.apply_agent_invite();

create or replace function public.admin_invite_agent(p_email text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
begin
  perform public.require_admin(true);
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'not a valid email address' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'this email already has an account' using errcode = '23505';
  end if;
  insert into public.agent_invites (email, invited_by) values (v_email, auth.uid())
  on conflict (email) do update set invited_by = excluded.invited_by, created_at = now(), expires_at = now() + interval '7 days';
  insert into public.audit_log (user_id, event, detail)
  values (auth.uid(), 'agent_invited', 'invited ' || public.mask_email(v_email) || ' from the admin page');
end;
$$;

create or replace function public.admin_cancel_invite(p_email text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_admin(true);
  delete from public.agent_invites where email = lower(trim(p_email));
  if found then
    insert into public.audit_log (user_id, event, detail)
    values (auth.uid(), 'agent_invite_cancelled', 'cancelled ' || public.mask_email(lower(trim(p_email))));
  end if;
end;
$$;

-- The agents, and invitations nobody has used yet. Agents are staff, so their emails are shown.
create or replace function public.admin_list_agents() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin(false);
  return jsonb_build_object(
    'agents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
        'set_up', exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified')
      ) order by u.email)
      from auth.users u
      where u.raw_app_meta_data ->> 'role' = 'agent' and (u.banned_until is null or u.banned_until < now())
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'created_at', i.created_at, 'expires_at', i.expires_at) order by i.created_at desc)
      from public.agent_invites i where i.expires_at > now()
    ), '[]'::jsonb)
  );
end;
$$;

-- US-38 from the admin page: removes the agent role and suspends the account. The conversations stay.
-- former_agent keeps the account out of the passenger tools, so it can't be restored as a passenger.
create or replace function public.admin_deactivate_agent(p_user uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_admin(true);
  update auth.users
  set raw_app_meta_data = (raw_app_meta_data - 'role') || '{"former_agent": true}'::jsonb,
      banned_until = now() + interval '100 years'
  where id = p_user and raw_app_meta_data ->> 'role' = 'agent';
  if not found then
    raise exception 'not an agent account' using errcode = '22023';
  end if;
  perform public.end_all_sessions(p_user);
  insert into public.audit_log (user_id, event, detail) values (p_user, 'agent_deactivated', 'from the admin page');
end;
$$;

-- ---------------------------------------------------------------------------
-- Passenger accounts. Only looked up by email (at least 3 characters), never listed in full, and
-- never with their conversations. Agent and administrator accounts aren't managed here.
-- ---------------------------------------------------------------------------
create or replace function public.admin_find_passengers(p_search text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_search text := lower(trim(p_search));
begin
  perform public.require_admin(false);
  if v_search is null or char_length(v_search) < 3 or char_length(v_search) > 254 then
    raise exception 'type at least 3 characters of the email' using errcode = '22023';
  end if;
  insert into public.audit_log (user_id, event, detail) values (auth.uid(), 'admin_viewed', 'passenger account search');
  return coalesce((
    select jsonb_agg(r order by r ->> 'email')
    from (
      select jsonb_build_object(
        'id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
        'suspended', u.banned_until is not null and u.banned_until > now(),
        'conversations', (select count(*) from public.conversations c where c.user_id = u.id)
      ) as r
      from auth.users u
      where coalesce(u.raw_app_meta_data ->> 'role', 'customer') = 'customer'
        and u.raw_app_meta_data ->> 'former_agent' is null
        and strpos(lower(u.email), v_search) > 0
      order by u.email
      limit 20
    ) found
  ), '[]'::jsonb);
end;
$$;

create or replace function public.passenger_target(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_user = auth.uid() then
    raise exception 'you cannot change your own account here' using errcode = '22023';
  end if;
  if not exists (
    select 1 from auth.users
    where id = p_user and coalesce(raw_app_meta_data ->> 'role', 'customer') = 'customer' and raw_app_meta_data ->> 'former_agent' is null
  ) then
    raise exception 'not a passenger account' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.admin_suspend_passenger(p_user uuid, p_suspend boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_admin(true);
  perform public.passenger_target(p_user);
  update auth.users
  set banned_until = case when p_suspend then now() + interval '100 years' else null end
  where id = p_user;
  if p_suspend then
    perform public.end_all_sessions(p_user);
  end if;
  insert into public.audit_log (user_id, event, detail)
  values (p_user, case when p_suspend then 'account_suspended' else 'account_restored' end::public.audit_event, 'from the admin page');
end;
$$;

-- Like delete_my_account(): the account, its conversations and authenticators go; its audit entries
-- stay for the retention period without pointing to it.
create or replace function public.admin_delete_passenger(p_user uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_admin(true);
  perform public.passenger_target(p_user);
  update public.audit_log set user_id = null where user_id = p_user;
  delete from public.agent_sessions where user_id = p_user;
  delete from auth.users where id = p_user;
  insert into public.audit_log (user_id, event, detail) values (null, 'account_deleted', 'by an administrator');
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading the audit log. Emails are masked; at most 5,000 rows per read, between two dates no more
-- than a year apart. The read itself is logged.
-- ---------------------------------------------------------------------------
create or replace function public.admin_audit_log(p_from date, p_to date, p_event text default null, p_limit int default 200)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_admin(false);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'choose dates no more than a year apart' using errcode = '22023';
  end if;
  insert into public.audit_log (user_id, event, detail)
  values (auth.uid(), 'audit_viewed', left(p_from || ' to ' || p_to || coalesce(' ' || p_event, '') || ', up to ' || p_limit || ' rows', 200));
  return coalesce((
    select jsonb_agg(r order by r ->> 'at' desc)
    from (
      select jsonb_build_object(
        'at', a.created_at, 'event', a.event, 'account', public.mask_email(u.email),
        'role', coalesce(u.raw_app_meta_data ->> 'role', case when u.id is null then null else 'customer' end),
        'ip', a.ip, 'detail', a.detail
      ) as r
      from public.audit_log a
      left join auth.users u on u.id = a.user_id
      where a.created_at >= p_from and a.created_at < p_to + 1
        and (p_event is null or a.event::text = p_event)
      order by a.created_at desc
      limit least(greatest(coalesce(p_limit, 200), 1), 5000)
    ) rows
  ), '[]'::jsonb);
end;
$$;

-- Helpers are internal; only the admin_* functions (which check the caller) are callable.
revoke execute on function public.is_admin_now(), public.code_is_fresh(), public.require_admin(boolean),
  public.mask_email(text), public.end_all_sessions(uuid), public.passenger_target(uuid) from public, anon, authenticated;
revoke execute on function public.admin_invite_agent(text), public.admin_cancel_invite(text), public.admin_list_agents(),
  public.admin_deactivate_agent(uuid), public.admin_find_passengers(text), public.admin_suspend_passenger(uuid, boolean),
  public.admin_delete_passenger(uuid), public.admin_audit_log(date, date, text, int) from public, anon;
grant execute on function public.admin_invite_agent(text), public.admin_cancel_invite(text), public.admin_list_agents(),
  public.admin_deactivate_agent(uuid), public.admin_find_passengers(text), public.admin_suspend_passenger(uuid, boolean),
  public.admin_delete_passenger(uuid), public.admin_audit_log(date, date, text, int) to authenticated;
