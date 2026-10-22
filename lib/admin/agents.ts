import type { SupabaseClient, User } from '@supabase/supabase-js';

// Call-centre agent accounts (overview §10.11, US-32, US-38). Used only by the admin scripts
// (scripts/invite-agent.ts, scripts/deactivate-agent.ts) with the service-role key; the web app
// never imports this. Agent accounts are always new, separate accounts: an existing customer
// account is never turned into an agent one, so work and personal conversations never mix (US-36).

// About 100 years: Supabase has no permanent ban, so a deactivated account is banned for this long.
const BAN_FOREVER = '876000h';

// Admin actions go in the audit log too (overview §10.10). The service role writes the table
// directly; nobody else can. Best effort: the action itself has already happened.
async function auditAdmin(admin: SupabaseClient, userId: string, event: 'agent_invited' | 'agent_deactivated', detail: string) {
  const { error } = await admin.from('audit_log').insert({ user_id: userId, event, detail });
  if (error) console.error(`could not write the audit log: ${error.message}`);
}

export type InviteResult = { kind: 'invited' | 'resent'; userId: string; link: string };

export async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`could not list users: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
}

export const isAgent = (user: User) => user.app_metadata?.role === 'agent';
const isBanned = (user: User) => Boolean(user.banned_until && new Date(user.banned_until) > new Date());
// The user list doesn't include authenticators, so ask for them.
async function hasAuthenticator(admin: SupabaseClient, user: User): Promise<boolean> {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  if (error) throw new Error(`could not check the account's authenticators: ${error.message}`);
  return data.factors.some((f) => f.factor_type === 'totp' && f.status === 'verified');
}

// The link the agent opens to set a password and an authenticator. It comes back to this site's
// /auth/confirm, which checks the one-time token with Supabase. No email is sent: the admin
// passes the link on through the work channel they trust, so this works without custom SMTP.
export function confirmLink(site: string, tokenHash: string, type: 'invite' | 'magiclink'): string {
  const url = new URL('/auth/confirm', site);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);
  return url.toString();
}

// Creates an agent account and returns its one-time sign-in link. For an agent who never
// finished setting up (no authenticator yet), it returns a fresh link instead.
export async function inviteAgent(admin: SupabaseClient, email: string, site: string): Promise<InviteResult> {
  const existing = await findUserByEmail(admin, email);
  if (existing) {
    if (!isAgent(existing)) {
      throw new Error(
        'this email already has a customer account. Agent accounts must be separate work accounts: use a different email address.',
      );
    }
    if (isBanned(existing)) throw new Error('this agent was deactivated. Delete the account in the Supabase dashboard first, then invite again.');
    if (await hasAuthenticator(admin, existing)) throw new Error('this agent has already set up their account. They sign in on the sign-in page.');
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: existing.email! });
    if (error) throw new Error(`could not create a new link: ${error.message}`);
    await auditAdmin(admin, existing.id, 'agent_invited', 'new setup link (admin script)');
    return { kind: 'resent', userId: existing.id, link: confirmLink(site, data.properties.hashed_token, 'magiclink') };
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email });
  if (error) throw new Error(`could not create the invitation: ${error.message}`);
  const userId = data.user.id;
  // Only the service role can set app_metadata; users can't change it themselves.
  const update = await admin.auth.admin.updateUserById(userId, { app_metadata: { role: 'agent' } });
  if (update.error) {
    // Don't leave a half-made account behind that could later be set up as a customer.
    await admin.auth.admin.deleteUser(userId);
    throw new Error(`could not give the account the agent role: ${update.error.message}`);
  }
  await auditAdmin(admin, userId, 'agent_invited', 'admin script');
  return { kind: 'invited', userId, link: confirmLink(site, data.properties.hashed_token, 'invite') };
}

// US-38: removes the agent role and bans the account. Supabase then rejects the account's
// sessions on the next request, and the database stops serving staff content to its old tokens
// straight away (staff_access() checks the account, not just the token).
// The account's conversations are kept; deleting the user in the dashboard removes them.
export async function deactivateAgent(admin: SupabaseClient, email: string): Promise<string> {
  const user = await findUserByEmail(admin, email);
  if (!user) throw new Error('no account with this email.');
  if (!isAgent(user)) throw new Error('this is not an agent account, so there is nothing to deactivate.');
  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { role: null }, ban_duration: BAN_FOREVER });
  if (error) throw new Error(`could not deactivate the account: ${error.message}`);
  await auditAdmin(admin, user.id, 'agent_deactivated', 'admin script');
  return user.id;
}

// The agent test user for `npm run eval` (DEV_AGENT_* in .dev.vars). Unlike a real agent, it is
// created with a password, so the evaluation can sign in without opening a link.
export async function createTestAgent(admin: SupabaseClient, email: string, password: string): Promise<'created' | 'exists'> {
  const existing = await findUserByEmail(admin, email);
  if (existing) {
    if (!isAgent(existing)) throw new Error('this email already has a customer account. Use another address for the agent test user.');
    return 'exists';
  }
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'agent' } });
  if (error) throw new Error(`could not create the agent test user: ${error.message}`);
  return 'created';
}
