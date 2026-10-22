-- RLS proof for the core schema. Run with: npx supabase test db
-- Each block switches to a role with a hand-made JWT, the same way PostgREST does for real requests.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(35);

-- ---------------------------------------------------------------------------
-- Fixtures (inserted as the owner, which bypasses RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'customer-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'customer-b@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'agent@example.test');
-- The agent's account as an admin set it up (Phase 9 checks the account, not only the token).
update auth.users set raw_app_meta_data = '{"role":"agent"}' where id = '33333333-3333-3333-3333-333333333333';

insert into public.documents (id, slug, title, audience, illustrative, content_hash) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'baggage', 'Baggage policy', 'public', false, 'h1'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'refund-procedure', 'Refund procedure (sample)', 'staff', true, 'h2');

insert into public.document_chunks (document_id, audience, section, content, embedding)
select d.id, d.audience, 'Section ' || g, d.title || ' chunk ' || g,
       array_fill((0.1 + g / 100.0)::real, array[1536])::vector
from public.documents d, generate_series(1, 6) g;

insert into public.conversations (id, user_id, audience) values
  ('cccccccc-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'customer'),
  ('cccccccc-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'customer');

insert into public.messages (conversation_id, role, content) values
  ('cccccccc-0000-0000-0000-00000000000a', 'user', 'What is the baggage allowance?'),
  ('cccccccc-0000-0000-0000-00000000000b', 'user', 'Can I get a refund?');

-- Every table in public has RLS switched on.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'every table in public has RLS enabled');

-- ---------------------------------------------------------------------------
-- Anonymous visitors: no privileges at all
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select count(*) from public.documents', '42501', null, 'anon cannot read documents');
select throws_ok('select count(*) from public.conversations', '42501', null, 'anon cannot read conversations');
select throws_ok($$select * from public.match_documents(array_fill(0.1::real, array[1536])::vector)$$,
  '42501', null, 'anon cannot call match_documents');
reset role;

-- ---------------------------------------------------------------------------
-- Customer A with only a password (AAL1): sees nothing, not even their own data
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.documents), 0, 'AAL1 user sees no documents');
select is((select count(*)::int from public.document_chunks), 0, 'AAL1 user sees no chunks');
select is((select count(*)::int from public.conversations), 0, 'AAL1 user sees no conversations, even their own');
select is((select count(*)::int from public.match_documents(array_fill(0.1::real, array[1536])::vector)), 0,
  'AAL1 user gets no search results');
select throws_ok($$insert into public.conversations (audience) values ('customer')$$,
  '42501', null, 'AAL1 user cannot create a conversation');
reset role;

-- ---------------------------------------------------------------------------
-- Customer A with MFA (AAL2)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2","app_metadata":{}}', true);
select is((select count(*)::int from public.documents where audience = 'staff'), 0, 'customer sees no staff documents');
select is((select count(*)::int from public.document_chunks where audience = 'staff'), 0, 'customer sees no staff chunks');
select ok((select count(*) from public.documents where audience = 'public') = 1, 'customer sees public documents');
select is((select count(*)::int from public.match_documents(array_fill(0.1::real, array[1536])::vector, 10)
           where audience = 'staff'), 0, 'customer search returns no staff chunks');
select is((select count(*)::int from public.match_documents(array_fill(0.1::real, array[1536])::vector, 10)), 6,
  'customer search returns the public chunks');
select is((select count(*)::int from public.conversations), 1, 'customer A sees only their own conversation');
select is((select count(*)::int from public.messages), 1, 'customer A sees only their own messages');
select throws_ok($$insert into public.messages (conversation_id, role, content)
                   values ('cccccccc-0000-0000-0000-00000000000b', 'user', 'injected')$$,
  '42501', null, 'customer A cannot add a message to customer B''s conversation');
select throws_ok($$insert into public.conversations (audience) values ('agent')$$,
  '42501', null, 'customer cannot open an agent conversation');
select lives_ok($$insert into public.conversations (audience) values ('customer')$$,
  'customer can open their own customer conversation');
select throws_ok($$update public.messages set content = 'edited'$$,
  '42501', null, 'messages cannot be edited');
select throws_ok($$insert into public.documents (slug, title, audience, content_hash) values ('x', 'x', 'public', 'x')$$,
  '42501', null, 'customer cannot write to the knowledge base');
reset role;

-- A role placed in user_metadata (which users can edit themselves) grants nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2","user_metadata":{"role":"agent"}}', true);
select is((select count(*)::int from public.documents where audience = 'staff'), 0,
  'a role in user_metadata does not unlock staff documents');
reset role;

-- ---------------------------------------------------------------------------
-- Call-centre agent with MFA (role set in app_metadata by an admin). Phase 9: staff content also
-- needs an active session (30-minute idle timeout) and an authenticator code under 8 hours old.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '44444444-0000-0000-0000-000000000001', 'app_metadata', json_build_object('role', 'agent'),
  'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 60))
)::text, true);
select is((select count(*)::int from public.documents where audience = 'staff'), 0,
  'agent sees no staff documents before the session is recorded');
select throws_ok('select count(*) from public.agent_sessions', '42501', null, 'agent cannot read the session table');
select is(public.touch_agent_session(), 'active', 'touching a new agent session records it');
select is((select count(*)::int from public.documents), 2, 'agent sees public and staff documents');
select ok((select count(*) from public.match_documents(array_fill(0.1::real, array[1536])::vector, 10)
           where audience = 'staff') > 0, 'agent search includes staff chunks');
select is((select count(*)::int from public.match_documents(array_fill(0.1::real, array[1536])::vector, 500)), 10,
  'search returns at most 10 chunks');
reset role;

-- 31 minutes without activity: the session stays expired, even if touched again.
update public.agent_sessions set last_seen = now() - interval '31 minutes'
  where session_id = '44444444-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::int from public.documents where audience = 'staff'), 0, 'an idle agent session sees no staff documents');
select is(public.touch_agent_session(), 'idle', 'an idle agent session cannot be revived');
reset role;
update public.agent_sessions set last_seen = now() where session_id = '44444444-0000-0000-0000-000000000001';

-- An authenticator code older than 8 hours.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '44444444-0000-0000-0000-000000000001', 'app_metadata', json_build_object('role', 'agent'),
  'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 9 * 3600))
)::text, true);
select is((select count(*)::int from public.documents where audience = 'staff'), 0,
  'an agent whose code is over 8 hours old sees no staff documents');
reset role;

-- Deactivated (banned) by an admin: the old token, still saying "agent", gets nothing.
update auth.users set banned_until = now() + interval '100 years' where id = '33333333-3333-3333-3333-333333333333';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '44444444-0000-0000-0000-000000000001', 'app_metadata', json_build_object('role', 'agent'),
  'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 60))
)::text, true);
select is((select count(*)::int from public.documents where audience = 'staff'), 0,
  'a deactivated agent with an old token sees no staff documents');
reset role;
update auth.users set banned_until = null where id = '33333333-3333-3333-3333-333333333333';

-- A customer token can't record an agent session.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2","session_id":"44444444-0000-0000-0000-000000000002","app_metadata":{}}', true);
select is(public.touch_agent_session(), 'not_agent', 'a customer cannot record an agent session');
reset role;

-- Signing out ends staff access for that token straight away.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '44444444-0000-0000-0000-000000000001', 'app_metadata', json_build_object('role', 'agent'),
  'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 60))
)::text, true);
select is((select count(*)::int from public.documents where audience = 'staff'), 1, 'the agent sees staff documents again');
select public.end_agent_session();
select is((select count(*)::int from public.documents where audience = 'staff'), 0, 'after sign-out the token sees no staff documents');
reset role;

select * from finish();
rollback;
