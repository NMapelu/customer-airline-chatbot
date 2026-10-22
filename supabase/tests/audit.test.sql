-- Phase 10: audit log, retention and account deletion. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

insert into auth.users (id, email) values
  ('51111111-1111-1111-1111-111111111111', 'leaving@example.test'),
  ('52222222-2222-2222-2222-222222222222', 'staying@example.test'),
  ('53333333-3333-3333-3333-333333333333', 'agent-leaving@example.test');
update auth.users set raw_app_meta_data = '{"role":"agent"}' where id = '53333333-3333-3333-3333-333333333333';
insert into public.conversations (id, user_id, audience, updated_at) values
  ('d0000000-0000-0000-0000-000000000001', '51111111-1111-1111-1111-111111111111', 'customer', now()),
  ('d0000000-0000-0000-0000-000000000002', '52222222-2222-2222-2222-222222222222', 'customer', now()),
  ('d0000000-0000-0000-0000-000000000003', '52222222-2222-2222-2222-222222222222', 'customer', now() - interval '13 months');
insert into public.messages (conversation_id, role, content) values
  ('d0000000-0000-0000-0000-000000000001', 'user', 'Leaving soon'),
  ('d0000000-0000-0000-0000-000000000003', 'user', 'Very old question');
insert into public.audit_log (user_id, event, created_at) values
  ('52222222-2222-2222-2222-222222222222', 'sign_in', now() - interval '13 months');

-- ---------------------------------------------------------------------------
-- Audit log: append-only and invisible through the API
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select count(*) from public.audit_log', '42501', null, 'anon cannot read the audit log');
select lives_ok($$select public.log_event('sign_in_failed', '196.201.214.0', null)$$, 'anon can record a failed sign-in');
select lives_ok($$select public.log_event('mfa_enrolled')$$, 'anon asking for a signed-in event is ignored, not an error');
reset role;
select is((select count(*)::int from public.audit_log where event = 'sign_in_failed' and user_id is null and ip = '196.201.214.0'), 1,
  'the failed sign-in was recorded without a user');
select is((select count(*)::int from public.audit_log where event = 'mfa_enrolled'), 0, 'an anonymous signed-in event was dropped');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"51111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}', true);
select throws_ok('select count(*) from public.audit_log', '42501', null, 'a user cannot read the audit log');
select throws_ok($$insert into public.audit_log (event) values ('sign_in')$$, '42501', null, 'a user cannot write to the audit log directly');
select throws_ok($$update public.audit_log set detail = 'x'$$, '42501', null, 'a user cannot change the audit log');
select throws_ok('delete from public.audit_log', '42501', null, 'a user cannot delete from the audit log');
select lives_ok($$select public.log_event('mfa_verified', null, 'test')$$, 'a user can record an event');
reset role;
select is((select user_id from public.audit_log where event = 'mfa_verified'), '51111111-1111-1111-1111-111111111111'::uuid,
  'the entry is tied to the user in the token, not one the caller names');

-- ---------------------------------------------------------------------------
-- Retention: 12 months
-- ---------------------------------------------------------------------------
set local role authenticated;
select throws_ok('select public.purge_expired()', '42501', null, 'users cannot run the retention job');
reset role;
select public.purge_expired();
select is((select count(*)::int from public.conversations where id = 'd0000000-0000-0000-0000-000000000003'), 0,
  'a conversation idle for 13 months is deleted');
select is((select count(*)::int from public.messages where content = 'Very old question'), 0, 'its messages go with it');
select is((select count(*)::int from public.conversations where id = 'd0000000-0000-0000-0000-000000000002'), 1,
  'a recent conversation is kept');
select is((select count(*)::int from public.audit_log where created_at < now() - interval '12 months'), 0,
  'audit entries older than 12 months are deleted');
select is((select count(*)::int from cron.job where jobname = 'purge-expired-data'), 1, 'the retention job is scheduled daily');

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '51111111-1111-1111-1111-111111111111', 'role', 'authenticated', 'aal', 'aal2',
  'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 3600))
)::text, true);
select throws_ok('select public.delete_my_account()', '42501', null, 'deleting needs a code entered in the last 5 minutes');

select set_config('request.jwt.claims', json_build_object(
  'sub', '53333333-3333-3333-3333-333333333333', 'role', 'authenticated', 'aal', 'aal2', 'app_metadata', json_build_object('role', 'agent'),
  'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 10))
)::text, true);
select throws_ok('select public.delete_my_account()', '42501', null, 'an agent cannot delete their work account');

select set_config('request.jwt.claims', json_build_object(
  'sub', '51111111-1111-1111-1111-111111111111', 'role', 'authenticated', 'aal', 'aal2',
  'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 10))
)::text, true);
select lives_ok('select public.delete_my_account()', 'a user who just entered a code can delete their account');
reset role;
select ok(
  not exists (select 1 from auth.users where id = '51111111-1111-1111-1111-111111111111')
  and not exists (select 1 from public.conversations where user_id = '51111111-1111-1111-1111-111111111111')
  and not exists (select 1 from public.messages where content = 'Leaving soon'),
  'the account, its conversations and its messages are gone');
select ok(
  not exists (select 1 from public.audit_log where user_id = '51111111-1111-1111-1111-111111111111')
  and exists (select 1 from public.audit_log where event = 'account_deleted' and user_id is null),
  'audit entries no longer point to the deleted account, and the deletion is recorded');

select * from finish();
rollback;
