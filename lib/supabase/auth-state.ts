import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { AuthStatus } from '../auth/access';
import type { Role } from '../rag/types';

// Shared by proxy.ts and the server code in ./server.ts. No Next.js request APIs here, so proxy.ts can use it.

// Session cookies (overview §10.0 secure by default). HTTP-only: the browser never talks to Supabase
// directly, so page scripts never need to read the tokens. Secure outside `npm run dev`
// (`npm run preview` runs on http://localhost, which browsers treat as secure).
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== 'development',
  sameSite: 'lax',
  path: '/',
} as const;

export type AuthState = { status: AuthStatus; user: User | null; role: Role };

// Where this session stands (see lib/auth/access.ts). The user comes from Supabase Auth, not just
// the cookie, so a forged or revoked token counts as signed out. Any failure is 'error', which
// the callers treat as no access (fail-safe).
export async function getAuthState(supabase: SupabaseClient): Promise<AuthState> {
  const none = (status: AuthStatus): AuthState => ({ status, user: null, role: 'customer' });
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return none('signed_out');

    const { data, error } = await supabase.auth.getUser();
    // An expired or revoked session is a normal sign-out; anything else (network, config) is an error.
    if (error) return none(error.status && error.status >= 400 && error.status < 500 ? 'signed_out' : 'error');
    const user = data.user;

    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || !aal) return none('error');

    // Count only authenticators Supabase says are verified, from the user it just returned.
    const enrolled = (user.factors ?? []).some((f) => f.factor_type === 'totp' && f.status === 'verified');
    // The role comes from app_metadata, which users can't edit. Anything else means customer.
    const role: Role = user.app_metadata?.role === 'agent' ? 'agent' : 'customer';
    const status: AuthStatus = !enrolled ? 'needs_enrol' : aal.currentLevel === 'aal2' ? 'aal2' : 'needs_verify';
    return { status, user, role };
  } catch (error) {
    console.error('session check failed', error);
    return none('error');
  }
}

