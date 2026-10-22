-- Phase 11.6: shared answers (overview §7.15, §8.5). A passenger can share one question and its
-- answer as a read-only link. The link id is a random UUID (122 random bits), the shared page shows
-- no user details, links expire after 30 days, and the owner can revoke one at any time.
-- Agents can't share: their answers may hold internal procedures.
create table public.shared_answers (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  revoked     boolean not null default false,
  check (expires_at <= created_at + interval '30 days')
);
create index on public.shared_answers (user_id, created_at desc);
alter table public.shared_answers enable row level security;

create policy "read own shares" on public.shared_answers
  for select to authenticated
  using (public.is_aal2() and user_id = (select auth.uid()));

create policy "share own passenger answers" on public.shared_answers
  for insert to authenticated
  with check (
    public.is_aal2() and user_id = (select auth.uid()) and public.app_role() <> 'agent'
    and exists (
      select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.id = message_id and m.role = 'assistant' and c.audience = 'customer' and c.user_id = (select auth.uid())
    )
  );

-- Revoking is the only change, and it can't be undone.
create policy "revoke own shares" on public.shared_answers
  for update to authenticated
  using (public.is_aal2() and user_id = (select auth.uid()))
  with check (revoked);

-- Column privileges (defense in depth): the caller only names the answer, or sets revoked.
revoke all on public.shared_answers from anon, authenticated;
grant select on public.shared_answers to authenticated;
grant insert (message_id) on public.shared_answers to authenticated;
grant update (revoked) on public.shared_answers to authenticated;

-- The shared page reads one link through this function, signed in or not. It returns the
-- answer, its sources and the question just before it, only while the link is live, and nothing
-- about who shared it.
create or replace function public.get_shared_answer(p_id uuid)
returns table (question text, answer text, sources jsonb, answered_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select
    (select q.content from public.messages q
      where q.conversation_id = m.conversation_id and q.role = 'user' and q.created_at <= m.created_at
      order by q.created_at desc limit 1),
    m.content, m.sources, m.created_at
  from public.shared_answers s
  join public.messages m on m.id = s.message_id
  join public.conversations c on c.id = m.conversation_id
  where s.id = p_id and not s.revoked and s.expires_at > now()
    and m.role = 'assistant' and c.audience = 'customer'
$$;
revoke execute on function public.get_shared_answer(uuid) from public;
grant execute on function public.get_shared_answer(uuid) to anon, authenticated;

-- Retention: expired and revoked links are removed with the daily clean-up.
create or replace function public.purge_expired() returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.conversations where updated_at < now() - interval '12 months';
  delete from public.audit_log where created_at < now() - interval '12 months';
  delete from public.agent_sessions where last_seen < now() - interval '1 day';
  delete from public.shared_answers where revoked or expires_at < now();
$$;
revoke execute on function public.purge_expired() from public, anon, authenticated;
