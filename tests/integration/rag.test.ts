// Integration test for the Phase 6 database path, run in CI against a local Supabase stack
// (`npm run test:integration` after `npx supabase start`). No OpenAI calls: embeddings are fixed vectors.
// It checks, through the real API, RLS and MFA: that the test-user sign-in reaches AAL2, that
// retrieval returns only the audiences a role allows, that an AAL1 session gets nothing, and that
// the escalation contact details come from the Contact Us document.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MockEmbeddingModelV4 } from 'ai/test';
import { getContactDetails } from '../../lib/rag/contact';
import { retrieve } from '../../lib/rag/retrieve';
import { devUserClient } from '../../lib/supabase/dev-user';
import { totp } from '../../lib/totp';

const URL = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!URL.startsWith('http://127.0.0.1') && !URL.startsWith('http://localhost')) {
  throw new Error('Integration tests only run against the local Supabase stack.');
}

const DIM = 1536;
const unit = (i: number) => Array.from({ length: DIM }, (_, j) => (j === i ? 1 : 0));
const BAGGAGE = unit(0);
const CONTACT = unit(1);
const embeddingOf = (vector: number[]) =>
  new MockEmbeddingModelV4({ doEmbed: async () => ({ embeddings: [vector], warnings: [] }) });

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, options);
const password = 'Integration-test-1!';
const created: string[] = [];

async function load(slug: string, audience: 'public' | 'staff', content: string, embedding: number[]) {
  const { error } = await admin.rpc('replace_document_chunks', {
    p_slug: slug,
    p_title: slug,
    p_audience: audience,
    p_illustrative: audience === 'staff',
    p_source_url: audience === 'public' ? `https://www.kenya-airways.com/${slug}/` : null,
    p_retrieved_at: '2026-10-16',
    p_content_hash: slug,
    p_chunks: [{ section: 'Main', content, embedding }],
  });
  assert.equal(error, null);
}

// A user with an enrolled authenticator, signed in the same way `npm run dev` does it.
async function mfaUser(email: string, role?: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: role ? { role } : {},
  });
  assert.equal(error, null);
  created.push(data.user!.id);

  const setup = createClient(URL, ANON, options);
  await setup.auth.signInWithPassword({ email, password });
  const enrol = await setup.auth.mfa.enroll({ factorType: 'totp' });
  assert.equal(enrol.error, null);
  const secret = enrol.data!.totp.secret;
  const verify = await setup.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: await totp(secret) });
  assert.equal(verify.error, null);
  // Wait for the next 30-second window so the sign-in below uses a fresh code.
  await new Promise((resolve) => setTimeout(resolve, 30_000 - (Date.now() % 30_000) + 500));

  return devUserClient({
    SUPABASE_URL: URL,
    SUPABASE_ANON_KEY: ANON,
    DEV_USER_EMAIL: email,
    DEV_USER_PASSWORD: password,
    DEV_USER_TOTP_SECRET: secret,
  });
}

let customer: SupabaseClient;
let agent: SupabaseClient;

before(async () => {
  await load('baggage-allowance', 'public', 'Economy passengers may check two bags of 23 kg.', BAGGAGE);
  await load('contact-us', 'public', 'Call our contact centre on +254 20 123 4567 any time.', CONTACT);
  await load('refund-procedure', 'staff', 'Internal: verify the caller before discussing baggage.', BAGGAGE);
  customer = await mfaUser('customer@example.test');
  agent = await mfaUser('agent@example.test', 'agent');
});

after(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
  await admin.from('documents').delete().in('slug', ['baggage-allowance', 'contact-us', 'refund-procedure']);
});

test('the test user sign-in reaches AAL2', async () => {
  const { data } = await customer.auth.mfa.getAuthenticatorAssuranceLevel();
  assert.equal(data?.currentLevel, 'aal2');
});

test('a customer retrieves public chunks only', async () => {
  const chunks = await retrieve(customer, embeddingOf(BAGGAGE), 'bags', 5);
  assert.ok(chunks.length > 0);
  assert.equal(chunks[0].title, 'baggage-allowance');
  assert.ok(chunks[0].similarity > 0.99);
  assert.ok(chunks.every((c) => c.audience === 'public'));
});

test('an agent also retrieves staff chunks', async () => {
  const chunks = await retrieve(agent, embeddingOf(BAGGAGE), 'bags', 5);
  assert.ok(chunks.some((c) => c.audience === 'staff'));
});

test('a session without MFA retrieves nothing', async () => {
  const aal1 = createClient(URL, ANON, options);
  await aal1.auth.signInWithPassword({ email: 'customer@example.test', password });
  assert.deepEqual(await retrieve(aal1, embeddingOf(BAGGAGE), 'bags', 5), []);
});

test('escalation contact details come from the Contact Us document', async () => {
  assert.deepEqual(await getContactDetails(customer), {
    phone: '+254 20 123 4567',
    url: 'https://www.kenya-airways.com/contact-us/',
  });
});
