// One-time setup for the test user that `npm run eval` signs in as.
//
//   npm run dev-user
//
// Reads SUPABASE_URL, SUPABASE_ANON_KEY, DEV_USER_EMAIL and DEV_USER_PASSWORD from .dev.vars,
// signs in as that user, enrols an authenticator (TOTP) and saves its secret to .dev.vars as
// DEV_USER_TOTP_SECRET, so the evaluation can sign in at AAL2 like a real user would.
// It uses the anon key only. Create the user first in the Supabase dashboard (see the README).
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabaseUrlSchema } from '../lib/supabase/url';
import { totp } from '../lib/totp';

const FILE = '.dev.vars';

function fail(message: string): never {
  console.error(`\nTest user setup stopped: ${message}`);
  process.exit(1);
}

if (!existsSync(FILE)) fail(`${FILE} not found. Copy .dev.vars.example to .dev.vars first.`);
process.loadEnvFile(FILE);
const parsed = z
  .object({
    SUPABASE_URL: supabaseUrlSchema,
    SUPABASE_ANON_KEY: z.string({ error: 'is required' }).min(1, 'is required'),
    DEV_USER_EMAIL: z.email({ error: "must be the test user's email address" }),
    DEV_USER_PASSWORD: z.string({ error: 'is required' }).min(1, 'is required'),
    DEV_USER_TOTP_SECRET: z.string().optional(),
  })
  .safeParse(process.env);
if (!parsed.success) {
  fail(`check ${FILE}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}`);
}
const env = parsed.data;

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const signIn = await supabase.auth.signInWithPassword({ email: env.DEV_USER_EMAIL, password: env.DEV_USER_PASSWORD });
  if (signIn.error) fail(`could not sign in as ${env.DEV_USER_EMAIL}: ${signIn.error.message}`);
  const role = signIn.data.user.app_metadata?.role ?? 'customer';

  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) fail(`could not list authenticators: ${factors.error.message}`);
  const verified = factors.data.totp.find((f) => f.status === 'verified');

  if (verified) {
    // Already enrolled: check that the saved secret still works.
    if (!env.DEV_USER_TOTP_SECRET) {
      fail(
        'this user already has an authenticator, but DEV_USER_TOTP_SECRET is not in .dev.vars. ' +
          'In Supabase, open Authentication → Users → the test user and delete its MFA factor, then run this again.',
      );
    }
    const check = await supabase.auth.mfa.challengeAndVerify({ factorId: verified.id, code: await totp(env.DEV_USER_TOTP_SECRET) });
    if (check.error) fail(`the saved DEV_USER_TOTP_SECRET did not work: ${check.error.message}`);
    console.log(`Test user ready: ${env.DEV_USER_EMAIL} (role: ${role}), MFA verified.`);
    return;
  }

  // Remove half-finished enrolments from earlier attempts.
  for (const f of factors.data.all.filter((f) => f.factor_type === 'totp' && f.status === 'unverified')) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const enrol = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'dev-test-user' });
  if (enrol.error) fail(`could not enrol an authenticator: ${enrol.error.message}`);
  const secret = enrol.data.totp.secret;
  const verify = await supabase.auth.mfa.challengeAndVerify({ factorId: enrol.data.id, code: await totp(secret) });
  if (verify.error) fail(`could not verify the authenticator: ${verify.error.message}`);

  const text = readFileSync(FILE, 'utf8');
  appendFileSync(FILE, `${text.endsWith('\n') ? '' : '\n'}DEV_USER_TOTP_SECRET=${secret}\n`);
  console.log(`Test user ready: ${env.DEV_USER_EMAIL} (role: ${role}), MFA enrolled.`);
  console.log(`Saved DEV_USER_TOTP_SECRET to ${FILE}. Now run npm run eval.`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
