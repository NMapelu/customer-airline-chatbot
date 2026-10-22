-- Phase 11.9: the administrator's insights dashboard (overview §7.13, US-21).
-- The admin role is set in app_metadata by `npm run set-admin` (service role only). An admin chats
-- as a customer: app_role() = 'admin' gets public documents only.
alter type public.audit_event add value if not exists 'admin_granted';
alter type public.audit_event add value if not exists 'admin_removed';
alter type public.audit_event add value if not exists 'admin_viewed';

-- One call returns everything the dashboard shows, and records the visit in the audit log in the
-- same transaction, so there is no way to read the figures without leaving a trace.
-- Privacy (§7.13): no user ids or emails anywhere in the result. Question text and feedback
-- details only come from the last 30 days; older data appears only in monthly totals.
-- Plain SQL can't use the new enum values in this migration's transaction, hence plpgsql.
create or replace function public.admin_insights() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_since timestamptz := now() - interval '30 days';
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_aal2() or public.app_role() <> 'admin' then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  insert into public.audit_log (user_id, event) values (auth.uid(), 'admin_viewed');

  select jsonb_build_object(
    -- Questions per day for the last 30 days, and per month before that.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'questions', d.n) order by d.day)
      from (select date_trunc('day', created_at)::date as day, count(*) as n from public.messages
            where role = 'user' and created_at >= v_since group by 1) d), '[]'::jsonb),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM'), 'questions', m.n) order by m.month)
      from (select date_trunc('month', created_at) as month, count(*) as n from public.messages
            where role = 'user' and created_at < v_since group by 1) m), '[]'::jsonb),
    -- Answer, escalation and refusal counts over the last 30 days (unavailable replies aren't saved).
    'kinds', coalesce((
      select jsonb_object_agg(k.kind, k.n)
      from (select kind, count(*) as n from public.messages
            where role = 'assistant' and kind is not null and created_at >= v_since group by kind) k), '{}'::jsonb),
    -- Most-cited documents over the last 30 days: one count per answer that cited the document.
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('title', t.title, 'answers', t.n) order by t.n desc, t.title)
      from (select s ->> 'title' as title, count(distinct m.id) as n
            from public.messages m, jsonb_array_elements(m.sources) s
            where m.role = 'assistant' and m.created_at >= v_since group by 1 order by 2 desc limit 10) t), '[]'::jsonb),
    -- Escalated questions from the last 30 days (the question just before each escalation).
    'escalated', coalesce((
      select jsonb_agg(e.question)
      from (select (select q.content from public.messages q
                    where q.conversation_id = m.conversation_id and q.role = 'user' and q.created_at <= m.created_at
                    order by q.created_at desc limit 1) as question
            from public.messages m
            where m.role = 'assistant' and m.kind = 'escalation' and m.created_at >= v_since
            order by m.created_at desc limit 500) e
      where e.question is not null), '[]'::jsonb),
    'feedback', jsonb_build_object(
      'up', (select count(*) from public.message_feedback where rating = 'up' and created_at >= v_since),
      'down', (select count(*) from public.message_feedback where rating = 'down' and created_at >= v_since),
      -- The latest thumbs-down answers with their reasons.
      'latest_down', coalesce((
        select jsonb_agg(jsonb_build_object('at', d.created_at, 'reason', d.reason, 'question', d.question, 'answer', left(d.answer, 500)) order by d.created_at desc)
        from (select f.created_at, f.reason, m.content as answer,
                     (select q.content from public.messages q
                      where q.conversation_id = m.conversation_id and q.role = 'user' and q.created_at <= m.created_at
                      order by q.created_at desc limit 1) as question
              from public.message_feedback f join public.messages m on m.id = f.message_id
              where f.rating = 'down' and f.created_at >= v_since
              order by f.created_at desc limit 20) d), '[]'::jsonb)
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.admin_insights() from public, anon;
grant execute on function public.admin_insights() to authenticated;
