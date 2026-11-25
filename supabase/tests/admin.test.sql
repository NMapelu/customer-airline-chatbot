-- Administrator tools: agents, passenger accounts and the audit log. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

insert into auth.users (id, email, raw_app_meta_data) values
  ('a1111111-1111-1111-1111-111111111111', 'boss@example.test', '{"role":"admin"}'),
  ('b1111111-1111-1111-1111-111111111111', 'pax@example.test', '{}'),
  ('c1111111-1111-1111-1111-111111111111', 'agent@example.test', '{"role":"agent"}');
insert into public.conversations (id, user_id, audience) values
  ('e0000000-0000-0000-0000-000000000001', 'b1111111-1111-1111-1111-111111111111', 'customer');

-- A signed-in token for a user, with a code entered 10 seconds ago (fresh) or an hour ago.
create function pg_temp.sign_in(p_sub text, p_role text, p_fresh boolean) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'aal', 'aal2', 'app_metadata', jsonb_build_object('role', p_role),
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
      'timestamp', extract(epoch from now()) - case when p_fresh then 10 else 3600 end))
  )::text, true)
$$;

-- ---------------------------------------------------------------------------
-- Only administrators, checked against the account and not just the token
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select public.admin_list_agents()', '42501', null, 'anon cannot call the admin functions');
reset role;

select pg_temp.sign_in('b1111111-1111-1111-1111-111111111111', 'customer', true);
set local role authenticated;
select throws_ok('select public.admin_list_agents()', '42501', 'administrators only', 'a passenger cannot list agents');
select throws_ok('select public.admin_audit_log(current_date, current_date)', '42501', 'administrators only',
  'a passenger cannot read the audit log');
reset role;

select pg_temp.sign_in('b1111111-1111-1111-1111-111111111111', 'admin', true);
set local role authenticated;
select throws_ok('select public.admin_list_agents()', '42501', 'administrators only',
  'a token that claims admin is not enough: the account must be one');
select throws_ok('select * from public.agent_invites', '42501', null, 'invitations are not readable directly');
select throws_ok($$select public.end_all_sessions('a1111111-1111-1111-1111-111111111111')$$, '42501', null,
  'the internal helpers are not callable');
reset role;

-- ---------------------------------------------------------------------------
-- Changes need a fresh code
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a1111111-1111-1111-1111-111111111111', 'admin', false);
set local role authenticated;
select lives_ok('select public.admin_list_agents()', 'an administrator can list agents with an older code');
select throws_ok($$select public.admin_invite_agent('new@example.test')$$, 'P0001', 'enter a new authenticator code first',
  'but changes need a code from the last 5 minutes');
reset role;

-- ---------------------------------------------------------------------------
-- Agent invitations
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a1111111-1111-1111-1111-111111111111', 'admin', true);
set local role authenticated;
select lives_ok($$select public.admin_invite_agent(' New@Example.test ')$$, 'an administrator can invite an agent');
select throws_ok($$select public.admin_invite_agent('pax@example.test')$$, '23505', 'this email already has an account',
  'an existing passenger account cannot be invited');
select throws_ok($$select public.admin_invite_agent('nonsense')$$, '22023', 'not a valid email address', 'the email is checked');
select is(public.admin_list_agents() -> 'invites' -> 0 ->> 'email', 'new@example.test', 'the invitation is listed, in lower case');
reset role;

insert into auth.users (id, email) values ('d1111111-1111-1111-1111-111111111111', 'new@example.test');
select is((select raw_app_meta_data ->> 'role' from auth.users where id = 'd1111111-1111-1111-1111-111111111111'), 'agent',
  'signing up with an invited email makes an agent account');
select is((select count(*)::int from public.agent_invites), 0, 'the invitation is used up');
insert into auth.users (id, email) values ('d2222222-2222-2222-2222-222222222222', 'someone@example.test');
select is((select raw_app_meta_data ->> 'role' from auth.users where id = 'd2222222-2222-2222-2222-222222222222'), null,
  'any other sign-up stays a passenger');

-- ---------------------------------------------------------------------------
-- Passenger accounts
-- ---------------------------------------------------------------------------
set local role authenticated;
select throws_ok($$select public.admin_find_passengers('ex')$$, '22023', 'type at least 3 characters of the email',
  'the search needs at least 3 characters');
select is(jsonb_array_length(public.admin_find_passengers('example.test')), 2, 'the search finds passengers only');
select lives_ok($$select public.admin_suspend_passenger('b1111111-1111-1111-1111-111111111111', true)$$, 'a passenger can be suspended');
reset role;
select ok((select banned_until > now() from auth.users where id = 'b1111111-1111-1111-1111-111111111111'), 'the account is blocked');
set local role authenticated;
select lives_ok($$select public.admin_suspend_passenger('b1111111-1111-1111-1111-111111111111', false)$$, 'and restored');
select throws_ok($$select public.admin_suspend_passenger('c1111111-1111-1111-1111-111111111111', true)$$, '22023',
  'not a passenger account', 'agents are not managed as passengers');
select throws_ok($$select public.admin_suspend_passenger('a1111111-1111-1111-1111-111111111111', true)$$, '22023',
  'you cannot change your own account here', 'an administrator cannot suspend themselves');

-- ---------------------------------------------------------------------------
-- Deactivating an agent
-- ---------------------------------------------------------------------------
select lives_ok($$select public.admin_deactivate_agent('c1111111-1111-1111-1111-111111111111')$$, 'an agent can be deactivated');
select throws_ok($$select public.admin_deactivate_agent('b1111111-1111-1111-1111-111111111111')$$, '22023',
  'not an agent account', 'a passenger cannot be deactivated as an agent');
select is(jsonb_array_length(public.admin_find_passengers('agent@')), 0, 'a former agent does not show up as a passenger');
reset role;
select ok((select raw_app_meta_data ->> 'role' is null and banned_until > now() from auth.users
  where id = 'c1111111-1111-1111-1111-111111111111'), 'the former agent has no role and is blocked');

-- ---------------------------------------------------------------------------
-- Deleting a passenger, and the audit log
-- ---------------------------------------------------------------------------
set local role authenticated;
select lives_ok($$select public.admin_delete_passenger('b1111111-1111-1111-1111-111111111111')$$, 'a passenger can be deleted');
reset role;
select is((select count(*)::int from public.conversations where id = 'e0000000-0000-0000-0000-000000000001'), 0,
  'their conversations go with the account');
set local role authenticated;
select is(public.admin_audit_log(current_date, current_date, 'agent_invited') -> 0 ->> 'account', 'bo***@example.test',
  'the audit log masks emails');
select throws_ok('select public.admin_audit_log(current_date, current_date - 1)', '22023',
  'choose dates no more than a year apart', 'the dates are checked');
reset role;
select ok((select count(*) from public.audit_log where event = 'audit_viewed') >= 1, 'reading the audit log is recorded');

select * from finish();
rollback;
