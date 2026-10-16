-- Tests for replace_document_chunks, the function the ingest script loads documents with.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

create temporary table emb as
select to_jsonb(array_fill(0.1::real, array[1536])) as e;
grant select on emb to service_role, authenticated, anon;

-- Load a document with two chunks as the service role.
set local role service_role;
select lives_ok(
  $$select public.replace_document_chunks('baggage', 'Baggage', 'public', false,
      'https://www.kenya-airways.com/x/', '2026-10-16', 'h1',
      (select jsonb_build_array(
         jsonb_build_object('section', 'Hand', 'content', 'one', 'embedding', e),
         jsonb_build_object('section', 'Checked', 'content', 'two', 'embedding', e)) from emb))$$,
  'service role can load a document');
select is((select count(*)::int from public.document_chunks c join public.documents d on d.id = c.document_id
           where d.slug = 'baggage'), 2, 'both chunks are stored');
select is((select count(*)::int from public.document_chunks c join public.documents d on d.id = c.document_id
           where d.slug = 'baggage' and c.audience = 'public'), 2, 'chunks take the document''s audience');

-- Loading it again replaces the chunks instead of adding more.
select public.replace_document_chunks('baggage', 'Baggage v2', 'public', false,
  'https://www.kenya-airways.com/x/', '2026-10-17', 'h2',
  (select jsonb_build_array(jsonb_build_object('section', 'Hand', 'content', 'new', 'embedding', e)) from emb));
select is((select count(*)::int from public.documents where slug = 'baggage'), 1, 're-loading keeps one document row');
select is((select string_agg(content, ',') from public.document_chunks c join public.documents d on d.id = c.document_id
           where d.slug = 'baggage'), 'new', 're-loading replaces the old chunks');

-- A bad load fails as a whole and leaves the previous version in place.
select throws_ok(
  $$select public.replace_document_chunks('baggage', 'Broken', 'public', false, null, null, 'h3',
      '[{"section": "x", "content": "y", "embedding": [0.1, 0.2]}]'::jsonb)$$,
  null, 'an embedding with the wrong size is rejected');
select is((select title from public.documents where slug = 'baggage'), 'Baggage v2', 'a failed load changes nothing');
select throws_ok(
  $$select public.replace_document_chunks('empty', 'Empty', 'public', false, null, null, 'h4', '[]'::jsonb)$$,
  'P0001', 'a document needs at least one chunk', 'a document with no chunks is rejected');
reset role;

-- Nobody else may call it.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal2","app_metadata":{"role":"agent"}}', true);
select throws_ok(
  $$select public.replace_document_chunks('x', 'x', 'staff', true, null, null, 'h', '[]'::jsonb)$$,
  '42501', null, 'signed-in users cannot call it, even agents');
reset role;
set local role anon;
select throws_ok(
  $$select public.replace_document_chunks('x', 'x', 'public', false, null, null, 'h', '[]'::jsonb)$$,
  '42501', null, 'anonymous visitors cannot call it');
reset role;

select * from finish();
rollback;
