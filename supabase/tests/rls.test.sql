-- RLS proof for the core schema. Run with: npx supabase test db
-- Each block switches to a role with a hand-made JWT, the same way PostgREST does for real requests.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

-- ---------------------------------------------------------------------------
-- Fixtures (inserted as the owner, which bypasses RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'customer-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'customer-b@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'agent@example.test');

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
-- Call-centre agent with MFA (role set in app_metadata by an admin)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal2","app_metadata":{"role":"agent"}}', true);
select is((select count(*)::int from public.documents), 2, 'agent sees public and staff documents');
select ok((select count(*) from public.match_documents(array_fill(0.1::real, array[1536])::vector, 10)
           where audience = 'staff') > 0, 'agent search includes staff chunks');
select is((select count(*)::int from public.match_documents(array_fill(0.1::real, array[1536])::vector, 500)), 10,
  'search returns at most 10 chunks');
reset role;

select * from finish();
rollback;
