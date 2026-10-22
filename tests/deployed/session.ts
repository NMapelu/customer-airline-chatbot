import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { totp } from '../../lib/totp';

// Sessions for the checks that run against a deployed site (overview §15.2): the access-control
// tests, the authenticated ZAP scan and the red-team suite. A test user signs in straight to
// Supabase, the same way the sign-in pages do, and the session is written in the cookie format the
// app reads, so requests carry a real session without driving a browser.
// Test users only: their details come from CI secrets, never from the repository.

export type TestUser = { email: string; password: string; totpSecret: string };

export function testUser(prefix: 'TEST_CUSTOMER' | 'TEST_AGENT'): TestUser | null {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  const totpSecret = process.env[`${prefix}_TOTP_SECRET`];
  return email && password && totpSecret ? { email, password, totpSecret } : null;
}

export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  return { url, anonKey };
}

export type Session = { cookie: string; supabase: SupabaseClient };

// `level` 1 stops after the password (an AAL1 session, like someone without the code).
export async function signIn(user: TestUser, level: 1 | 2 = 2): Promise<Session> {
  const { url, anonKey } = supabaseEnv();
  const jar = new Map<string, string>();
  const ssr = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const signedIn = await ssr.auth.signInWithPassword({ email: user.email, password: user.password });
  if (signedIn.error) throw new Error(`sign-in failed for the test user: ${signedIn.error.message}`);
  if (level === 2) {
    const factors = await ssr.auth.mfa.listFactors();
    const factor = factors.data?.totp.find((f) => f.status === 'verified');
    if (!factor) throw new Error('the test user has no verified authenticator');
    const verify = await ssr.auth.mfa.challengeAndVerify({ factorId: factor.id, code: await totp(user.totpSecret) });
    if (verify.error) throw new Error(`MFA failed for the test user: ${verify.error.message}`);
  }
  const { data } = await ssr.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('no session after sign-in');
  // A plain client with the same token, for direct database checks under RLS.
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  return { cookie, supabase };
}
