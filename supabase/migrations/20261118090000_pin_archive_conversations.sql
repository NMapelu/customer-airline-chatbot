-- Pin and archive conversations from the sidebar menu. Each is the time it happened, or null.
-- The existing "own conversations" policy already limits updates to the owner in an AAL2 session,
-- so no new policy is needed.
alter table public.conversations
  add column pinned_at   timestamptz,
  add column archived_at timestamptz;

-- The sidebar lists a user's unarchived conversations, pinned first.
create index on public.conversations (user_id, archived_at, pinned_at desc, updated_at desc);
