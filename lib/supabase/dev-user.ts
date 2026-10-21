import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { totp } from '../totp';

// The test user for scripts: `npm run eval` and the integration tests sign in as it with a
// password and a TOTP code, so they get a real MFA-verified (AAL2) session and the same RLS as
// real users. Nothing here bypasses RLS or uses the service role. The web app never uses it:
// since Phase 8 people sign in through the sign-in pages.
// Set it up once with `npm run dev-user` (see the README).

type DevUserEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  DEV_USER_EMAIL?: string;
  DEV_USER_PASSWORD?: string;
  DEV_USER_TOTP_SECRET?: string;
};
type Cached = { client: SupabaseClient; expiresAt: number };
// One session per test user, reused until shortly before it expires.
const cache = new Map<string, Cached>();

export async function devUserClient(env: DevUserEnv): Promise<SupabaseClient> {
  const { DEV_USER_EMAIL: email, DEV_USER_PASSWORD: password, DEV_USER_TOTP_SECRET: secret } = env;
  if (!email || !password || !secret) {
    throw new Error('The development test user is not set up. Run `npm run dev-user` (see the README).');
  }
  const cached = cache.get(email);
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.client;
  cache.delete(email);

  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`test user sign-in failed: ${signIn.error.message}`);

  const factors = await client.auth.mfa.listFactors();
  const factor = factors.data?.totp.find((f) => f.status === 'verified');
  if (!factor) throw new Error('The test user has no verified authenticator. Run `npm run dev-user`.');
  const verify = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: await totp(secret) });
  if (verify.error) throw new Error(`test user MFA failed: ${verify.error.message}`);

  cache.set(email, { client, expiresAt: verify.data.expires_in * 1000 + Date.now() });
  return client;
}
