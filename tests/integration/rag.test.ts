// Integration test for the chat's database path, run in CI against a local Supabase stack
// (`npm run test:integration` after `npx supabase start`). No OpenAI calls: embeddings are fixed vectors.
// It checks, through the real API, RLS and MFA: that the test-user sign-in reaches AAL2, that
// retrieval returns only the audiences a role allows, that an AAL1 session gets nothing, that
// the escalation contact details come from the Contact Us document, and (Phase 8) that saved
// conversations are private to their owner.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MockEmbeddingModelV4 } from 'ai/test';
import {
  deleteConversation,
  listConversations,
  loadConversation,
  openConversation,
  recentTurns,
  renameConversation,
  saveMessage,
} from '../../lib/chat/history';
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

// ---------------------------------------------------------------------------
// Conversation history (Phase 8), through lib/chat/history.ts as the chat route uses it.
// ---------------------------------------------------------------------------
const SOURCE = { title: 'Baggage', section: 'Main', url: 'https://www.kenya-airways.com/baggage/', retrievedAt: '2026-10-16', audience: 'public' as const };

test("a customer's conversation is saved, read back in order, and listed", async () => {
  const id = crypto.randomUUID();
  assert.equal(await openConversation(customer, id, 'customer', 'What is my baggage allowance in Economy?'), true);
  assert.equal(await openConversation(customer, id, 'customer', 'ignored the second time'), true);
  await saveMessage(customer, id, 'user', 'What is my baggage allowance in Economy?');
  await saveMessage(customer, id, 'assistant', 'Two bags of 23 kg.', [SOURCE]);

  assert.deepEqual(await recentTurns(customer, id, 5), [
    { role: 'user', text: 'What is my baggage allowance in Economy?' },
    { role: 'assistant', text: 'Two bags of 23 kg.' },
  ]);
  assert.deepEqual(await recentTurns(customer, id, 1), [{ role: 'assistant', text: 'Two bags of 23 kg.' }]);
  const loaded = await loadConversation(customer, id);
  assert.equal(loaded?.title, 'What is my baggage allowance in Economy?');
  assert.deepEqual(loaded?.messages.map((m) => m.metadata?.sources), [undefined, [SOURCE]]);
  assert.ok((await listConversations(customer)).some((c) => c.id === id));
});

test("another user can't read, add to, rename or delete someone's conversation", async () => {
  const id = crypto.randomUUID();
  await openConversation(customer, id, 'customer', 'Private question');
  await saveMessage(customer, id, 'user', 'Private question');

  assert.equal(await loadConversation(agent, id), null);
  assert.deepEqual(await recentTurns(agent, id, 5), []);
  assert.ok(!(await listConversations(agent)).some((c) => c.id === id));
  // RLS hides the row, so the insert collides with it instead of reaching it.
  assert.equal(await openConversation(agent, id, 'agent', 'Taking over'), false);
  await assert.rejects(saveMessage(agent, id, 'user', 'Injected'));
  assert.equal(await renameConversation(agent, id, 'Renamed'), false);
  assert.equal(await deleteConversation(agent, id), false);

  const still = await loadConversation(customer, id);
  assert.equal(still?.title, 'Private question');
  assert.equal(still?.messages.length, 1);
});

test('conversations are tagged with the real role, whatever the caller claims', async () => {
  const id = crypto.randomUUID();
  await assert.rejects(openConversation(customer, id, 'agent', 'Pretending to be an agent'));
  assert.equal(await openConversation(agent, id, 'agent', 'Agent question'), true);
});

test('a session without MFA sees no conversations and cannot start one', async () => {
  const aal1 = createClient(URL, ANON, options);
  await aal1.auth.signInWithPassword({ email: 'customer@example.test', password });
  assert.deepEqual(await listConversations(aal1), []);
  await assert.rejects(openConversation(aal1, crypto.randomUUID(), 'customer', 'No MFA'));
});

test('the owner can rename and permanently delete a conversation', async () => {
  const id = crypto.randomUUID();
  await openConversation(customer, id, 'customer', 'To be deleted');
  await saveMessage(customer, id, 'user', 'To be deleted');
  assert.equal(await renameConversation(customer, id, 'Renamed'), true);
  assert.equal((await loadConversation(customer, id))?.title, 'Renamed');
  assert.equal(await deleteConversation(customer, id), true);
  assert.equal(await loadConversation(customer, id), null);
  const { count } = await admin.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', id);
  assert.equal(count, 0);
});
