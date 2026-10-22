-- Phase 11.5: feedback on answers (overview §7.12, §8.5), and the kind of each saved assistant
-- message, which the insights dashboard counts (§7.13). Older messages have no kind.
alter table public.messages
  add column kind text check (kind in ('answer', 'refusal', 'escalation'));

-- One rating per user per answer. Reasons only go with a thumbs-down.
create table public.message_feedback (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rating      text not null check (rating in ('up', 'down')),
  reason      text check (reason in ('wrong', 'incomplete', 'did_not_answer', 'hard_to_understand')),
  created_at  timestamptz not null default now(),
  unique (message_id, user_id),
  check (rating = 'down' or reason is null)
);
create index on public.message_feedback (created_at);
alter table public.message_feedback enable row level security;

-- Users read and add only their own feedback, and only on answers in their own conversations.
-- Nobody can change or delete it; it goes when the answer does (retention, account deletion).
create policy "read own feedback" on public.message_feedback
  for select to authenticated
  using (public.is_aal2() and user_id = (select auth.uid()));

create policy "rate own answers" on public.message_feedback
  for insert to authenticated
  with check (
    public.is_aal2() and user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.id = message_id and m.role = 'assistant' and c.user_id = (select auth.uid())
    )
  );

revoke all on public.message_feedback from anon;
revoke update, delete, truncate on public.message_feedback from authenticated;
