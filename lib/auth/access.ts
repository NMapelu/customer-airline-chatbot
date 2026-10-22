// Who may open which path (overview §10.1). Pure, so the rules are unit-tested on their own;
// proxy.ts applies them to every request before any page or API route runs.
//
// signed_out    no valid session
// needs_enrol   signed in with a password, no verified authenticator yet (first sign-in)
// needs_verify  signed in with a password, authenticator enrolled but not used this session (AAL1)
// aal2          password and authenticator code: fully signed in
// error         the session could not be checked (Supabase unreachable, bad config)
export type AuthStatus = 'signed_out' | 'needs_enrol' | 'needs_verify' | 'aal2' | 'error';

export type Access = { action: 'allow' } | { action: 'redirect'; to: string } | { action: 'deny'; status: 401 | 503 };

// Where each status belongs. Anything else redirects here.
export const HOME: Record<Exclude<AuthStatus, 'error'>, string> = {
  signed_out: '/login',
  needs_enrol: '/mfa/enroll',
  needs_verify: '/mfa/verify',
  aal2: '/',
};

// Readable by anyone, signed in or not (the privacy notice is linked from sign-up), and shared
// answers (/s/<id>, overview §7.15), which show only what the owner chose to share.
const PUBLIC_PAGES = new Set(['/privacy']);
const isSharedAnswer = (pathname: string) => /^\/s\/[^/]+$/.test(pathname);
const SIGNED_OUT_PAGES = new Set(['/login', '/signup']);
// /welcome is where an invited agent chooses a password, before setting up an authenticator.
// The page also checks that the session came from the invitation link (app/(auth)/welcome).
const MFA_PAGES: Record<string, AuthStatus> = { '/mfa/enroll': 'needs_enrol', '/welcome': 'needs_enrol', '/mfa/verify': 'needs_verify' };

// Agents' shorter sessions (overview §7.14, §10.11). The database enforces the same limits in
// staff_access() (supabase/migrations/20261022090000_agent_mode.sql).
export const AGENT_IDLE_MINUTES = 30;
export const AGENT_CODE_MAX_HOURS = 8;

// True when an agent must enter an authenticator code again: the newest one in this session is
// more than 8 hours old, or there is none. `methods` are the session's sign-in methods with
// their times in seconds, as Supabase reports them (older tokens list bare method names).
export type SignInMethod = string | { method: string; timestamp: number };

export function agentNeedsCode(methods: SignInMethod[], now = Date.now()): boolean {
  const newest = Math.max(0, ...methods.flatMap((m) => (typeof m === 'object' && m.method === 'totp' ? [m.timestamp * 1000] : [])));
  return now - newest > AGENT_CODE_MAX_HOURS * 3600 * 1000;
}

const allow: Access = { action: 'allow' };
const redirect = (to: string): Access => ({ action: 'redirect', to });

export function accessFor(pathname: string, status: AuthStatus): Access {
  // The email confirmation link signs the user in itself, whatever state they are in.
  if (pathname === '/auth/confirm' || PUBLIC_PAGES.has(pathname) || isSharedAnswer(pathname)) return allow;

  // The sign-in pages stay reachable when the check fails, so nobody is locked in a redirect loop.
  if (SIGNED_OUT_PAGES.has(pathname)) {
    return status === 'signed_out' || status === 'error' ? allow : redirect(HOME[status]);
  }

  if (pathname in MFA_PAGES) {
    if (status === 'error') return { action: 'deny', status: 503 };
    return status === MFA_PAGES[pathname] ? allow : redirect(HOME[status]);
  }

  // Everything else, the chat API included, needs AAL2. Fail-safe: an error never lets a request through.
  if (status === 'aal2') return allow;
  if (pathname === '/api' || pathname.startsWith('/api/')) return { action: 'deny', status: status === 'error' ? 503 : 401 };
  return status === 'error' ? { action: 'deny', status: 503 } : redirect(HOME[status]);
}
