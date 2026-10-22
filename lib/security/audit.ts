import type { SupabaseClient } from '@supabase/supabase-js';
import { clientIp, truncateIp } from './client-ip';

// Security events for the audit log (overview §10.10). The database takes the user from the
// session token and keeps the table out of reach of every user (public.log_event).
// Never pass message content, passwords or codes as the detail.
export type AuditEvent =
  | 'sign_up'
  | 'email_confirmed'
  | 'sign_in'
  | 'sign_in_failed'
  | 'sign_out'
  | 'mfa_enrolled'
  | 'mfa_verified'
  | 'mfa_failed'
  | 'mfa_replaced'
  | 'conversation_deleted'
  | 'account_deleted'
  | 'rate_limited'
  | 'aal1_rejected'
  | 'agent_invited'
  | 'agent_deactivated'
  | 'agent_timed_out'
  | 'staff_content_blocked';

// Best effort: a failed write is logged on the server and never blocks the user's request.
export async function audit(supabase: SupabaseClient, event: AuditEvent, headers: Headers | null, detail?: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_event', {
      p_event: event,
      p_ip: headers ? truncateIp(clientIp(headers)) : null,
      p_detail: detail ?? null,
    });
    if (error) console.error('could not write the audit log', event, error.message);
  } catch (error) {
    console.error('could not write the audit log', event, error);
  }
}
