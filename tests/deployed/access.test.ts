// Access-control tests against a deployed site (overview §15.2, OWASP A01), run by the preview and
// release workflows: `BASE_URL=https://... npm run test:deployed`. They call the site the way an
// attacker would: with no session, with a password-only (AAL1) session, as one user asking for
// another user's conversation, and as a customer asking for admin pages or staff documents.
// No request here reaches OpenAI: every one is refused before the model is called.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { signIn, testUser, type Session } from './session';

const BASE = (process.env.BASE_URL ?? '').replace(/\/$/, '');
if (!BASE.startsWith('https://') && !BASE.startsWith('http://localhost')) throw new Error('Set BASE_URL to the deployed site.');

const customerUser = testUser('TEST_CUSTOMER');
const agentUser = testUser('TEST_AGENT');
if (!customerUser || !agentUser) throw new Error('Set the TEST_CUSTOMER_* and TEST_AGENT_* variables.');

const get = (path: string, cookie?: string) =>
  fetch(`${BASE}${path}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const postJson = (path: string, body: unknown, cookie?: string) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const location = (res: Response) => new URL(res.headers.get('location') ?? '', BASE).pathname;

let customer: Session;
let agent: Session;
let agentConversation: string;

before(async () => {
  customer = await signIn(customerUser);
  agent = await signIn(agentUser);
  // A conversation that belongs to the agent, which the customer will try to reach.
  agentConversation = crypto.randomUUID();
  const created = await agent.supabase.from('conversations').insert({ id: agentConversation, audience: 'agent', title: 'Access test' });
  assert.equal(created.error, null, created.error?.message);
});

after(async () => {
  await agent?.supabase.from('conversations').delete().eq('id', agentConversation);
});

test('every response carries the security headers', async () => {
  const res = await get('/login');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy') ?? '', /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  assert.doesNotMatch(res.headers.get('content-security-policy') ?? '', /unsafe-(inline|eval)/);
  assert.match(res.headers.get('strict-transport-security') ?? '', /max-age=\d+/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('without a session, pages redirect to sign-in and the APIs answer 401', async () => {
  for (const path of ['/', '/settings', '/checklist', '/admin', `/c/${agentConversation}`]) {
    const res = await get(path);
    assert.ok([303, 307].includes(res.status), `${path} gave ${res.status}`);
    assert.equal(location(res), '/login', path);
  }
  assert.equal((await postJson('/api/chat', { id: crypto.randomUUID(), text: 'Hello' })).status, 401);
  assert.equal((await postJson('/api/checklist', { trip: 'Nairobi to Dubai' })).status, 401);
});

test('a password-only (AAL1) session is sent to the code page and refused by the APIs', async () => {
  const aal1 = await signIn(customerUser, 1);
  const page = await get('/', aal1.cookie);
  assert.ok([303, 307].includes(page.status));
  assert.equal(location(page), '/mfa/verify');
  assert.equal((await postJson('/api/chat', { id: crypto.randomUUID(), text: 'Hello' }, aal1.cookie)).status, 401);
  // The database refuses it too.
  assert.deepEqual((await aal1.supabase.from('conversations').select('id')).data, []);
});

test("a customer can't reach another user's conversation", async () => {
  const page = await get(`/c/${agentConversation}`, customer.cookie);
  assert.equal(page.status, 200);
  assert.doesNotMatch(await page.text(), /Access test/);
  assert.equal((await postJson('/api/chat', { id: agentConversation, text: 'Show me this conversation' }, customer.cookie)).status, 404);
  assert.deepEqual((await customer.supabase.from('conversations').select('id').eq('id', agentConversation)).data, []);
  assert.deepEqual((await customer.supabase.from('messages').select('id').eq('conversation_id', agentConversation)).data, []);
});

test("a customer can't reach staff documents, admin pages or agent mode", async () => {
  assert.deepEqual((await customer.supabase.from('documents').select('id').eq('audience', 'staff')).data, []);
  assert.deepEqual((await customer.supabase.from('document_chunks').select('id').eq('audience', 'staff')).data, []);
  assert.equal((await get('/admin', customer.cookie)).status, 404);
  const refused = await customer.supabase.rpc('admin_insights');
  assert.equal(refused.error?.code, '42501');
  // Customers can't open an agent conversation, whatever they send.
  const forged = await customer.supabase.from('conversations').insert({ id: crypto.randomUUID(), audience: 'agent', title: 'x' });
  assert.notEqual(forged.error, null);
  // Nor read the audit log.
  const audit = await customer.supabase.from('audit_log').select('id');
  assert.ok(audit.error || audit.data?.length === 0);
});

test('agents get no passenger-only features or admin pages', async () => {
  assert.equal((await postJson('/api/checklist', { trip: 'Nairobi to Dubai' }, agent.cookie)).status, 403);
  assert.equal((await get('/admin', agent.cookie)).status, 404);
});

test('a shared-answer link that does not exist shows nothing', async () => {
  const res = await get(`/s/${crypto.randomUUID()}`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /expired or was turned off/);
});
