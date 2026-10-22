// Integration test for the chat's database path, run in CI against a local Supabase stack
// (`npm run test:integration` after `npx supabase start`). No OpenAI calls: embeddings are fixed vectors.
// It checks, through the real API, RLS and MFA: that the test-user sign-in reaches AAL2, that
// retrieval returns only the audiences a role allows, that an AAL1 session gets nothing, that
// the escalation contact details come from the Contact Us document, and (Phase 8) that saved
// conversations are private to their owner, and (Phase 9) the agent account rules: invitation,
// idle timeout, customer-ready wording in the history and deactivation, and (Phase 11) feedback,
// search, shared answers and the admin insights.
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
  saveFeedback,
  saveMessage,
  searchConversations,
} from '../../lib/chat/history';
import { createShare, getSharedAnswer, listShares, revokeShare } from '../../lib/chat/shares';
import { deactivateAgent, inviteAgent, setAdmin } from '../../lib/admin/agents';
import { getInsights } from '../../lib/admin/insights';
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
  // The app records agent activity on every request; staff content needs it (30-minute idle timeout).
  assert.equal((await agent.rpc('touch_agent_session')).data, 'active');
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

test("a customer's touch doesn't open an agent session", async () => {
  assert.equal((await customer.rpc('touch_agent_session')).data, 'not_agent');
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

// ---------------------------------------------------------------------------
// Agent accounts (Phase 9), through lib/admin/agents.ts as the admin scripts use it.
// ---------------------------------------------------------------------------
const SITE = 'http://127.0.0.1:3000';
const tokenFrom = (link: string) => {
  const url = new globalThis.URL(link);
  assert.equal(url.origin + url.pathname, `${SITE}/auth/confirm`);
  return { token_hash: url.searchParams.get('token_hash')!, type: url.searchParams.get('type') as 'invite' | 'magiclink' };
};

test('an invited agent sets a password and an authenticator, then sees staff content', async () => {
  const email = `invited-${Date.now()}@example.test`;
  const invite = await inviteAgent(admin, email, SITE);
  created.push(invite.userId);
  assert.equal(invite.kind, 'invited');

  const browser = createClient(URL, ANON, options);
  const verified = await browser.auth.verifyOtp(tokenFrom(invite.link));
  assert.equal(verified.error, null);
  assert.equal(verified.data.user?.app_metadata?.role, 'agent');
  // The link can only be used once.
  assert.notEqual((await createClient(URL, ANON, options).auth.verifyOtp(tokenFrom(invite.link))).error, null);
  // /welcome relies on this: a link sign-in shows up as 'otp'.
  const aal = await browser.auth.mfa.getAuthenticatorAssuranceLevel();
  assert.ok(aal.data?.currentAuthenticationMethods.some((m) => typeof m === 'object' && m.method === 'otp'));
  assert.equal((await browser.auth.updateUser({ password })).error, null);

  // Not finished yet (no authenticator): asking again gives a new link instead of an error.
  const again = await inviteAgent(admin, email, SITE);
  assert.equal(again.kind, 'resent');

  const enrol = await browser.auth.mfa.enroll({ factorType: 'totp' });
  const verify = await browser.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: await totp(enrol.data!.totp.secret) });
  assert.equal(verify.error, null);
  assert.equal((await browser.rpc('touch_agent_session')).data, 'active');
  assert.ok((await retrieve(browser, embeddingOf(BAGGAGE), 'bags', 5)).some((c) => c.audience === 'staff'));

  // Set up now: no more links.
  await assert.rejects(inviteAgent(admin, email, SITE), /already set up/);

  // Both links are in the audit log.
  const logged = await admin.from('audit_log').select('event').eq('user_id', invite.userId);
  assert.deepEqual(logged.data?.map((r) => r.event), ['agent_invited', 'agent_invited']);
});

test("a customer's account can't be turned into an agent account", async () => {
  await assert.rejects(inviteAgent(admin, 'customer@example.test', SITE), /customer account/);
  await assert.rejects(deactivateAgent(admin, 'customer@example.test'), /not an agent/);
});

test('after 30 minutes without activity an agent session gets no staff content and stays expired', async () => {
  const { data } = await agent.auth.getSession();
  const sessionId = JSON.parse(Buffer.from(data.session!.access_token.split('.')[1], 'base64url').toString()).session_id;
  const idle = await admin
    .from('agent_sessions')
    .update({ last_seen: new Date(Date.now() - 31 * 60_000).toISOString() })
    .eq('session_id', sessionId)
    .select('session_id');
  assert.equal(idle.data?.length, 1);
  assert.ok((await retrieve(agent, embeddingOf(BAGGAGE), 'bags', 5)).every((c) => c.audience === 'public'));
  assert.equal((await agent.rpc('touch_agent_session')).data, 'idle');
  // Restore, for the tests below.
  await admin.from('agent_sessions').update({ last_seen: new Date().toISOString() }).eq('session_id', sessionId);
});

test("an agent's customer-ready wording is saved with the answer and shown again", async () => {
  const id = crypto.randomUUID();
  await openConversation(agent, id, 'agent', 'Lost bag call');
  await saveMessage(agent, id, 'user', 'Lost bag call');
  const staffSource = { ...SOURCE, title: 'Baggage irregularity intake', url: null, audience: 'staff' as const, illustrative: true };
  await saveMessage(agent, id, 'assistant', '1. Take the report (Internal).', [staffSource, SOURCE], 'We will trace your bag.');
  await saveMessage(agent, id, 'assistant', '1. Refer to a supervisor (Internal).', [staffSource], null);
  const loaded = await loadConversation(agent, id);
  assert.equal(loaded?.audience, 'agent');
  assert.deepEqual(
    loaded?.messages.map((m) => m.metadata?.customerWording),
    [undefined, 'We will trace your bag.', null],
  );
  assert.equal(loaded?.messages[1].metadata?.sources?.[0].illustrative, true);
});

// ---------------------------------------------------------------------------
// Feedback, search, shared answers and insights (Phase 11).
// ---------------------------------------------------------------------------
async function answered(client: SupabaseClient, role: 'customer' | 'agent', question: string, kind: 'answer' | 'escalation' = 'answer') {
  const conversation = crypto.randomUUID();
  const answer = crypto.randomUUID();
  assert.ok(await openConversation(client, conversation, role, question));
  await saveMessage(client, conversation, 'user', question);
  await saveMessage(client, conversation, 'assistant', 'Two bags of 23 kg.', [SOURCE], null, { id: answer, kind });
  return { conversation, answer };
}

test('users rate their own answers once, and only their own', async () => {
  const { answer } = await answered(customer, 'customer', 'Feedback question');
  assert.equal(await saveFeedback(agent, answer, 'up', null), false);
  assert.equal(await saveFeedback(customer, answer, 'down', 'incomplete'), true);
  assert.equal(await saveFeedback(customer, answer, 'up', null), false);
  // A reason only goes with a thumbs-down, and only a known one.
  const other = await answered(customer, 'customer', 'Another feedback question');
  await assert.rejects(async () => customer.from('message_feedback').insert({ message_id: other.answer, rating: 'up', reason: 'wrong' }).throwOnError());
  await assert.rejects(async () => customer.from('message_feedback').insert({ message_id: other.answer, rating: 'down', reason: 'rude' }).throwOnError());
  // Nobody can change or read anyone else's feedback.
  const { data } = await agent.from('message_feedback').select('id').eq('message_id', answer);
  assert.deepEqual(data, []);
  const changed = await customer.from('message_feedback').update({ rating: 'up' }).eq('message_id', answer).select('id');
  assert.ok(changed.error || changed.data?.length === 0);
  const loaded = await loadConversation(customer, (await customer.from('messages').select('conversation_id').eq('id', answer).single()).data!.conversation_id);
  assert.equal(loaded?.messages[1].metadata?.rating, 'down');
  assert.equal(loaded?.messages[1].metadata?.messageId, answer);
});

test('search finds only the caller\'s own conversations, matching words literally', async () => {
  const { conversation } = await answered(customer, 'customer', 'Surfboard 100% question');
  assert.ok((await searchConversations(customer, 'surfboard')).some((c) => c.id === conversation));
  assert.ok((await searchConversations(customer, '100%')).some((c) => c.id === conversation));
  assert.ok(!(await searchConversations(customer, '1_0')).some((c) => c.id === conversation));
  assert.deepEqual(await searchConversations(agent, 'surfboard'), []);
});

test('a shared answer shows only the question, answer and sources, until revoked', async () => {
  const { answer } = await answered(customer, 'customer', 'Share this question');
  assert.equal(await createShare(agent, answer), null);
  const id = await createShare(customer, answer);
  assert.ok(id);
  const anon = createClient(URL, ANON, options);
  const shared = await getSharedAnswer(anon, id!);
  assert.deepEqual(Object.keys(shared!).sort(), ['answer', 'answeredAt', 'question', 'sources']);
  assert.equal(shared?.question, 'Share this question');
  assert.deepEqual(shared?.sources, [SOURCE]);
  // The table itself is out of reach: anonymous users read nothing, others see no rows.
  const anonRead = await anon.from('shared_answers').select('id');
  assert.ok(anonRead.error || anonRead.data?.length === 0);
  assert.deepEqual((await agent.from('shared_answers').select('id').eq('id', id!)).data, []);
  // Users can't choose their own expiry or owner.
  await assert.rejects(async () => customer.from('shared_answers').insert({ message_id: answer, expires_at: '2099-01-01' }).throwOnError());
  assert.ok((await listShares(customer)).some((s) => s.id === id));
  assert.equal(await revokeShare(agent, id!), false);
  assert.equal(await revokeShare(customer, id!), true);
  assert.equal(await getSharedAnswer(anon, id!), null);
  // A revoked link can't be turned back on.
  const undo = await customer.from('shared_answers').update({ revoked: false }).eq('id', id!).select('id');
  assert.ok(undo.error || undo.data?.length === 0);
  // Expired links stop working too.
  const expiring = await createShare(customer, answer);
  await admin.from('shared_answers').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', expiring!);
  assert.equal(await getSharedAnswer(anon, expiring!), null);
});

test("agents can't share answers, even their own", async () => {
  const { answer } = await answered(agent, 'agent', 'Agent share attempt');
  assert.equal(await createShare(agent, answer), null);
});

test('only an administrator sees the insights, without user ids, and each visit is audited', async () => {
  await answered(customer, 'customer', 'Can I bring an e-bike battery?', 'escalation');
  assert.equal(await getInsights(customer), null);
  const email = `admin-${Date.now()}@example.test`;
  const adminUser = await mfaUser(email, 'admin');
  // An agent account can't be made an admin.
  await assert.rejects(setAdmin(admin, 'agent@example.test', true), /agent account/);
  const insights = await getInsights(adminUser);
  assert.ok(insights);
  assert.ok(insights.gaps.some((g) => g.example === 'Can I bring an e-bike battery?'));
  assert.ok((insights.kinds.answer ?? 0) > 0);
  const text = JSON.stringify(insights);
  for (const id of created) assert.ok(!text.includes(id), 'no user ids in the insights');
  assert.ok(!text.includes('@example.test'), 'no emails in the insights');
  const me = (await adminUser.auth.getUser()).data.user!.id;
  const logged = await admin.from('audit_log').select('event').eq('user_id', me).eq('event', 'admin_viewed');
  assert.equal(logged.data?.length, 1);
  // An admin chats as a customer: no staff content.
  assert.ok((await retrieve(adminUser, embeddingOf(BAGGAGE), 'bags', 5)).every((c) => c.audience === 'public'));
});

// Last: it deactivates the shared agent.
test('a deactivated agent is signed out everywhere and their old token gets no staff content', async () => {
  assert.ok((await retrieve(agent, embeddingOf(BAGGAGE), 'bags', 5)).some((c) => c.audience === 'staff'));
  await deactivateAgent(admin, 'agent@example.test');
  const user = await agent.auth.getUser();
  assert.equal(user.error?.status, 403);
  // The token still says "agent" until it expires; the database checks the account itself.
  assert.ok((await retrieve(agent, embeddingOf(BAGGAGE), 'bags', 5)).every((c) => c.audience === 'public'));
  const signIn = await createClient(URL, ANON, options).auth.signInWithPassword({ email: 'agent@example.test', password });
  assert.notEqual(signIn.error, null);
  const logged = await admin.from('audit_log').select('event').eq('event', 'agent_deactivated').eq('user_id', created[1]);
  assert.equal(logged.data?.length, 1);
});

test('audit entries are tied to the signed-in user, and nobody can read the log through the API', async () => {
  const me = (await customer.auth.getUser()).data.user!.id;
  assert.equal((await customer.rpc('log_event', { p_event: 'sign_in', p_ip: '203.0.113.0' })).error, null);
  const logged = await admin.from('audit_log').select('user_id, ip').eq('event', 'sign_in').eq('user_id', me);
  assert.deepEqual(logged.data, [{ user_id: me, ip: '203.0.113.0' }]);

  const read = await customer.from('audit_log').select('id');
  assert.ok(read.error || read.data?.length === 0, 'a user must not read the audit log');
  const anon = createClient(URL, ANON, options);
  assert.equal((await anon.rpc('log_event', { p_event: 'sign_in_failed' })).error, null);
  // Events that need a signed-in user are dropped for anonymous callers.
  const before = (await admin.from('audit_log').select('id', { count: 'exact', head: true }).eq('event', 'mfa_replaced')).count;
  await anon.rpc('log_event', { p_event: 'mfa_replaced' });
  assert.equal((await admin.from('audit_log').select('id', { count: 'exact', head: true }).eq('event', 'mfa_replaced')).count, before);
});

test('a customer deletes their account with a fresh code, and all their rows go with it', async () => {
  const leaving = await mfaUser('leaving@example.test');
  const id = (await leaving.auth.getUser()).data.user!.id;
  const conversation = crypto.randomUUID();
  assert.ok(await openConversation(leaving, conversation, 'customer', 'My bags'));
  await saveMessage(leaving, conversation, 'user', 'How many bags?');
  await leaving.rpc('log_event', { p_event: 'sign_in' });

  // Signed out of the API, nothing happens.
  assert.notEqual((await createClient(URL, ANON, options).rpc('delete_my_account')).error, null);
  // The test user signed in with a fresh code moments ago.
  assert.equal((await leaving.rpc('delete_my_account')).error, null);

  assert.notEqual((await admin.auth.admin.getUserById(id)).error, null);
  assert.equal((await admin.from('conversations').select('id').eq('id', conversation)).data?.length, 0);
  assert.equal((await admin.from('messages').select('id').eq('conversation_id', conversation)).data?.length, 0);
  // Their audit entries stay for the retention period, no longer tied to them.
  assert.equal((await admin.from('audit_log').select('id').eq('user_id', id)).data?.length, 0);
  assert.ok((await admin.from('audit_log').select('id').eq('event', 'account_deleted')).data!.length > 0);
  const signIn = await createClient(URL, ANON, options).auth.signInWithPassword({ email: 'leaving@example.test', password });
  assert.notEqual(signIn.error, null);
});
