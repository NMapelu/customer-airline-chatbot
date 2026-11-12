-- Audit events for the forgotten-password flow (app/(auth)/forgot-password, app/(auth)/new-password).
alter type public.audit_event add value if not exists 'password_reset_requested';
alter type public.audit_event add value if not exists 'password_changed';

-- A reset is asked for while signed out, so log_event must accept it without a user, like a failed
-- sign-in. Otherwise unchanged from 20261022170000_audit_retention_deletion.sql. plpgsql only
-- checks the new enum value when it runs, after this migration has committed.
create or replace function public.log_event(p_event public.audit_event, p_ip text default null, p_detail text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null and p_event::text not in ('sign_up', 'sign_in_failed', 'mfa_failed', 'rate_limited', 'password_reset_requested') then
    return;
  end if;
  -- A flood cap: the function is callable by anyone, so a script can't grow the table without bound.
  if (select count(*) from public.audit_log where created_at > now() - interval '1 minute') >= 1000 then
    return;
  end if;
  insert into public.audit_log (user_id, event, ip, detail)
  values (v_user, p_event, left(p_ip, 64), left(p_detail, 200));
end;
$$;
