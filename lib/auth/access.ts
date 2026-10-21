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

const SIGNED_OUT_PAGES = new Set(['/login', '/signup']);
const MFA_PAGES: Record<string, AuthStatus> = { '/mfa/enroll': 'needs_enrol', '/mfa/verify': 'needs_verify' };

const allow: Access = { action: 'allow' };
const redirect = (to: string): Access => ({ action: 'redirect', to });

export function accessFor(pathname: string, status: AuthStatus): Access {
  // The email confirmation link signs the user in itself, whatever state they are in.
  if (pathname === '/auth/confirm') return allow;

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
