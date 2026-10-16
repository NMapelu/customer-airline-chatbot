-- Phase 5: load one knowledge-base document and its chunks in a single transaction.
-- Used only by scripts/ingest.ts with the service role. A function call is one transaction, so a
-- failed load leaves the previous version in place and re-runs never create duplicate chunks.
-- Each chunk's audience is copied from its document here, never taken from the caller.

create or replace function public.replace_document_chunks(
  p_slug          text,
  p_title         text,
  p_audience      public.audience,
  p_illustrative  boolean,
  p_source_url    text,
  p_retrieved_at  date,
  p_content_hash  text,
  p_chunks        jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_document_id uuid;
begin
  if p_audience is null then
    raise exception 'audience is required';
  end if;
  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
    raise exception 'a document needs at least one chunk';
  end if;

  insert into public.documents as d (slug, title, audience, illustrative, source_url, retrieved_at, content_hash, updated_at)
  values (p_slug, p_title, p_audience, p_illustrative, p_source_url, p_retrieved_at, p_content_hash, now())
  on conflict (slug) do update set
    title = excluded.title,
    audience = excluded.audience,
    illustrative = excluded.illustrative,
    source_url = excluded.source_url,
    retrieved_at = excluded.retrieved_at,
    content_hash = excluded.content_hash,
    updated_at = now()
  returning d.id into v_document_id;

  delete from public.document_chunks where document_id = v_document_id;

  insert into public.document_chunks (document_id, audience, section, content, embedding)
  select v_document_id, p_audience, c->>'section', c->>'content', (c->>'embedding')::extensions.vector
  from jsonb_array_elements(p_chunks) as c;

  return v_document_id;
end;
$$;

-- Least privilege: only the service role (the ingest script) may call it.
revoke execute on function public.replace_document_chunks(text, text, public.audience, boolean, text, date, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_document_chunks(text, text, public.audience, boolean, text, date, text, jsonb)
  to service_role;
