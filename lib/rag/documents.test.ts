import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDocument, planIngest } from './documents';

const publicDoc = (body = '## Rules\n\nText.', retrieved = '2026-10-16') =>
  `---\ntitle: "Baggage Allowance"\naudience: public\nsource_url: https://www.kenya-airways.com/en/x/\nretrieved: ${retrieved}\n---\n\n${body}\n`;
const staffDoc = (extra = 'illustrative: true') =>
  `---\ntitle: Refunds\naudience: staff\n${extra}\nbased_on: Refund policy\n---\n\n## Steps\n\n1. Check.\n`;

test('parses a public page', () => {
  const doc = parseDocument('baggage-allowance', 'public', publicDoc());
  assert.equal(doc.title, 'Baggage Allowance');
  assert.equal(doc.audience, 'public');
  assert.equal(doc.illustrative, false);
  assert.equal(doc.sourceUrl, 'https://www.kenya-airways.com/en/x/');
  assert.equal(doc.retrievedAt, '2026-10-16');
  assert.equal(doc.body, '## Rules\n\nText.');
});

test('parses a staff procedure as illustrative with no source URL', () => {
  const doc = parseDocument('refunds', 'staff', staffDoc());
  assert.equal(doc.audience, 'staff');
  assert.equal(doc.illustrative, true);
  assert.equal(doc.sourceUrl, null);
});

test('rejects a missing or mismatched audience instead of defaulting to public', () => {
  assert.throws(() => parseDocument('x', 'public', publicDoc().replace('audience: public\n', '')), /audience/);
  assert.throws(() => parseDocument('x', 'staff', publicDoc()), /audience is "public", expected "staff"/);
  assert.throws(() => parseDocument('x', 'public', staffDoc()), /audience is "staff", expected "public"/);
});

test('rejects a staff procedure that is not marked illustrative', () => {
  assert.throws(() => parseDocument('x', 'staff', staffDoc('illustrative: false')), /illustrative/);
});

test('rejects files without front matter', () => {
  assert.throws(() => parseDocument('x', 'public', '## Rules\n\nText.'), /front matter/);
});

test('the hash ignores the retrieval date but not the text', () => {
  const a = parseDocument('b', 'public', publicDoc('## Rules\n\nText.', '2026-10-16'));
  const b = parseDocument('b', 'public', publicDoc('## Rules\n\nText.', '2026-11-01'));
  const c = parseDocument('b', 'public', publicDoc('## Rules\n\nChanged.', '2026-10-16'));
  assert.equal(a.contentHash, b.contentHash);
  assert.notEqual(a.contentHash, c.contentHash);
});

test('plans added, updated, unchanged and removed documents', () => {
  const same = parseDocument('same', 'public', publicDoc());
  const changed = parseDocument('changed', 'public', publicDoc('## Rules\n\nNew.'));
  const fresh = parseDocument('fresh', 'staff', staffDoc());
  const remote = new Map([
    ['same', same.contentHash],
    ['changed', 'old-hash'],
    ['gone', 'whatever'],
  ]);
  const plan = planIngest([same, changed, fresh], remote);
  assert.deepEqual(plan.added.map((d) => d.slug), ['fresh']);
  assert.deepEqual(plan.updated.map((d) => d.slug), ['changed']);
  assert.deepEqual(plan.unchanged.map((d) => d.slug), ['same']);
  assert.deepEqual(plan.removed, ['gone']);
});

test('a second run with nothing changed reports everything unchanged', () => {
  const docs = [parseDocument('a', 'public', publicDoc()), parseDocument('b', 'staff', staffDoc())];
  const remote = new Map(docs.map((d) => [d.slug, d.contentHash]));
  const plan = planIngest(docs, remote);
  assert.equal(plan.unchanged.length, 2);
  assert.equal(plan.added.length + plan.updated.length + plan.removed.length, 0);
});

test('rejects the same slug in both folders', () => {
  const a = parseDocument('refunds', 'public', publicDoc());
  const b = parseDocument('refunds', 'staff', staffDoc());
  assert.throws(() => planIngest([a, b], new Map()), /duplicate slug/);
});
