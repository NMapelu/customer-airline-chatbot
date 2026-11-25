import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { type SignInMethod } from '../auth/access';

// The administrator's account tools (/admin/agents, /admin/passengers, /admin/audit). Everything goes
// through the admin_* database functions, which check the caller is an administrator right now,
// require a fresh authenticator code for every change, and write the audit log. The web app never
// holds the service-role key.

export const FRESH_CODE_MINUTES = 5;

// When the last authenticator code in this session stops counting as fresh (ms since 1970), or null.
export function freshCodeUntil(methods: SignInMethod[], now = Date.now()): number | null {
  const latest = Math.max(
    0,
    ...methods.filter((m) => typeof m === 'object' && m.method === 'totp').map((m) => (m as { timestamp: number }).timestamp),
  );
  const until = latest * 1000 + FRESH_CODE_MINUTES * 60_000;
  return latest > 0 && until > now ? until : null;
}

const agentsSchema = z.object({
  agents: z.array(
    z.object({ id: z.string(), email: z.string(), created_at: z.string(), last_sign_in_at: z.string().nullable(), set_up: z.boolean() }),
  ),
  invites: z.array(z.object({ email: z.string(), created_at: z.string(), expires_at: z.string() })),
});
export type AgentList = z.infer<typeof agentsSchema>;

const passengersSchema = z.array(
  z.object({
    id: z.string(),
    email: z.string(),
    created_at: z.string(),
    last_sign_in_at: z.string().nullable(),
    suspended: z.boolean(),
    conversations: z.number(),
  }),
);
export type Passenger = z.infer<typeof passengersSchema>[number];

const auditSchema = z.array(
  z.object({
    at: z.string(),
    event: z.string(),
    account: z.string().nullable(),
    role: z.string().nullable(),
    ip: z.string().nullable(),
    detail: z.string().nullable(),
  }),
);
export type AuditRow = z.infer<typeof auditSchema>[number];

// The events the audit log filter offers, in the words the page shows.
export const AUDIT_EVENTS: Record<string, string> = {
  sign_up: 'Sign-up',
  email_confirmed: 'Email confirmed',
  sign_in: 'Sign-in',
  sign_in_failed: 'Failed sign-in',
  sign_out: 'Sign-out',
  mfa_enrolled: 'Authenticator added',
  mfa_verified: 'Code accepted',
  mfa_failed: 'Wrong code',
  mfa_replaced: 'Authenticator replaced',
  password_reset_requested: 'Password reset requested',
  password_changed: 'Password changed',
  conversation_deleted: 'Conversation deleted',
  account_deleted: 'Account deleted',
  account_suspended: 'Account suspended',
  account_restored: 'Account restored',
  rate_limited: 'Too many attempts',
  aal1_rejected: 'Request without code refused',
  agent_invited: 'Agent invited',
  agent_invite_cancelled: 'Invitation cancelled',
  agent_joined: 'Agent signed up',
  agent_deactivated: 'Agent deactivated',
  agent_timed_out: 'Agent timed out',
  staff_content_blocked: 'Staff content blocked',
  admin_granted: 'Admin role given',
  admin_removed: 'Admin role removed',
  admin_viewed: 'Admin page viewed',
  audit_viewed: 'Audit log read',
};

// What the database refused, in words the page can show. Anything unexpected is logged, not shown.
export class AdminError extends Error {
  constructor(
    message: string,
    readonly needsCode = false,
  ) {
    super(message);
  }
}

function fail(error: { code?: string; message: string; hint?: string | null }, what: string): never {
  if (error.hint === 'fresh_code') throw new AdminError('Enter a new code from your authenticator app first.', true);
  if (error.code === '42501') throw new AdminError('Only administrators can do this.');
  if (error.code === '22023' || error.code === '23505') {
    throw new AdminError(error.message.charAt(0).toUpperCase() + error.message.slice(1) + '.');
  }
  console.error(`could not ${what}`, error.code, error.message);
  throw new AdminError('Sorry, something went wrong. Please try again.');
}

async function call<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>, schema: z.ZodType<T>, what: string): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error, what);
  return schema.parse(data);
}

export const listAgents = (supabase: SupabaseClient) => call(supabase, 'admin_list_agents', {}, agentsSchema, 'list the agents');

export const findPassengers = (supabase: SupabaseClient, search: string) =>
  call(supabase, 'admin_find_passengers', { p_search: search }, passengersSchema, 'search the passengers');

export const readAuditLog = (supabase: SupabaseClient, from: string, to: string, event: string | null, limit: number) =>
  call(supabase, 'admin_audit_log', { p_from: from, p_to: to, p_event: event, p_limit: limit }, auditSchema, 'read the audit log');

const nothing = z.unknown();
export const inviteAgent = (supabase: SupabaseClient, email: string) =>
  call(supabase, 'admin_invite_agent', { p_email: email }, nothing, 'invite the agent');
export const cancelInvite = (supabase: SupabaseClient, email: string) =>
  call(supabase, 'admin_cancel_invite', { p_email: email }, nothing, 'cancel the invitation');
export const deactivateAgent = (supabase: SupabaseClient, id: string) =>
  call(supabase, 'admin_deactivate_agent', { p_user: id }, nothing, 'deactivate the agent');
export const suspendPassenger = (supabase: SupabaseClient, id: string, suspend: boolean) =>
  call(supabase, 'admin_suspend_passenger', { p_user: id, p_suspend: suspend }, nothing, 'change the account');
export const deletePassenger = (supabase: SupabaseClient, id: string) =>
  call(supabase, 'admin_delete_passenger', { p_user: id }, nothing, 'delete the account');

// The audit log as a CSV file. Cells that a spreadsheet would read as a formula are prefixed with
// an apostrophe, so a crafted detail can't run anything when the file is opened.
export function auditCsv(rows: AuditRow[]): string {
  const cell = (value: string | null) => {
    let text = value ?? '';
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = rows.map((r) => [r.at, AUDIT_EVENTS[r.event] ?? r.event, r.account, r.role, r.ip, r.detail].map(cell).join(','));
  return ['Time (UTC),Event,Account,Role,IP address,Detail', ...lines].join('\r\n') + '\r\n';
}

// Dates for the audit log filter: YYYY-MM-DD, defaulting to the last 7 days.
const dateSchema = z.iso.date();
export function auditRange(from: unknown, to: unknown, now = new Date()): { from: string; to: string } {
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  const f = dateSchema.safeParse(from);
  const t = dateSchema.safeParse(to);
  return { from: f.success ? f.data : weekAgo, to: t.success ? t.data : today };
}

export const auditEvent = (value: unknown): string | null =>
  typeof value === 'string' && Object.hasOwn(AUDIT_EVENTS, value) ? value : null;
