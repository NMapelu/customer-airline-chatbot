-- Phase 3: core schema.
-- Knowledge base (documents + chunks with embeddings), vector search, conversations and messages.
-- Every table has Row Level Security, and every policy requires an MFA-verified (AAL2) session.
-- See docs/security/threat-model.md (I1, I2) and the refined overview §10.

-- Extensions live in their own schema, not in public.
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers: role and MFA level from the signed-in user's token.
-- The role comes from app_metadata, which only the service role can change.
-- Anything missing or unknown falls back to the least-privileged answer.
-- ---------------------------------------------------------------------------
create or replace function public.app_role() returns text
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'customer')
$$;

create or replace function public.is_aal2() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- ---------------------------------------------------------------------------
-- Knowledge base
-- ---------------------------------------------------------------------------
create type public.audience as enum ('public', 'staff');

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  audience      public.audience not null,
  illustrative  boolean not null default false,
  source_url    text,
  retrieved_at  date,
  content_hash  text not null,
  updated_at    timestamptz not null default now()
);

create table public.document_chunks (
  id           bigint generated always as identity primary key,
  document_id  uuid not null references public.documents(id) on delete cascade,
  audience     public.audience not null,
  section      text,
  content      text not null,
  embedding    extensions.vector(1536) not null
);
create index on public.document_chunks (document_id);
create index on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

-- Customers see public docs; agents see public + staff. MFA required.
create policy "read documents by audience" on public.documents
  for select to authenticated
  using (public.is_aal2() and (audience = 'public' or (audience = 'staff' and public.app_role() = 'agent')));

create policy "read chunks by audience" on public.document_chunks
  for select to authenticated
  using (public.is_aal2() and (audience = 'public' or (audience = 'staff' and public.app_role() = 'agent')));
-- No insert/update/delete policies: only the ingestion job (service role) can write.

-- Vector search. SECURITY INVOKER = runs as the caller, so the RLS above applies.
create or replace function public.match_documents(query_embedding extensions.vector(1536), match_count int default 5)
returns table (
  chunk_id bigint, document_id uuid, title text, section text, content text,
  audience public.audience, illustrative boolean, source_url text, retrieved_at date, similarity float
)
language sql stable security invoker set search_path = public, extensions as $$
  select c.id, d.id, d.title, c.section, c.content, c.audience, d.illustrative, d.source_url, d.retrieved_at,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 10)
$$;

-- ---------------------------------------------------------------------------
-- Conversations and messages
-- ---------------------------------------------------------------------------
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  audience    text not null check (audience in ('customer', 'agent')),
  title       text not null default 'New conversation' check (char_length(title) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.conversations (user_id, updated_at desc);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null check (char_length(content) between 1 and 20000),
  sources          jsonb not null default '[]' check (jsonb_typeof(sources) = 'array'),
  created_at       timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- A user can only see and change their own conversations, and a new conversation
-- is tagged with the caller's real role (a customer can't open an 'agent' conversation).
create policy "own conversations" on public.conversations
  for all to authenticated
  using (public.is_aal2() and user_id = (select auth.uid()))
  with check (
    public.is_aal2() and user_id = (select auth.uid())
    and audience = case when public.app_role() = 'agent' then 'agent' else 'customer' end
  );

create policy "read own messages" on public.messages
  for select to authenticated
  using (public.is_aal2() and exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

create policy "add own messages" on public.messages
  for insert to authenticated
  with check (public.is_aal2() and exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
-- No update policy on messages: history can't be edited. Deletes happen by deleting the conversation.

-- ---------------------------------------------------------------------------
-- Grants (defense in depth: RLS already blocks these, but the privileges are not even granted).
-- Supabase grants anon and authenticated full table privileges in public by default.
-- ---------------------------------------------------------------------------
revoke all on public.documents, public.document_chunks, public.conversations, public.messages from anon;
revoke insert, update, delete, truncate on public.documents, public.document_chunks from authenticated;
revoke update, delete, truncate on public.messages from authenticated;
revoke truncate on public.conversations from authenticated;

revoke execute on function public.match_documents(extensions.vector, int) from public, anon;
grant execute on function public.match_documents(extensions.vector, int) to authenticated;
