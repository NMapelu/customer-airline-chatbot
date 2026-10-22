import assert from 'node:assert/strict';
import { test } from 'node:test';
import { highlightPassage, isStale, MAX_PASSAGE_CHARS, splitSentences } from './passages';

test('sentences split at full stops and line breaks, not inside numbers, and join back exactly', () => {
  const text = 'Economy allows 23.5 kg. Business allows two bags!\nInfants get one bag? Yes.';
  const parts = splitSentences(text);
  assert.deepEqual(parts, ['Economy allows 23.5 kg. ', 'Business allows two bags!\n', 'Infants get one bag? ', 'Yes.']);
  assert.equal(parts.join(''), text);
});

test('the sentences that best match the question are highlighted, at most two', () => {
  const text = 'Welcome to our page. Economy passengers may check two bags of 23 kg. Infants may check one bag. Contact us any time.';
  const parts = highlightPassage(text, 'How many bags can Economy passengers check?');
  assert.equal(parts.map((p) => p.text).join(''), text);
  const marked = parts.filter((p) => p.highlight).map((p) => p.text.trim());
  assert.deepEqual(marked, ['Economy passengers may check two bags of 23 kg. Infants may check one bag.']);
});

test('nothing is highlighted when no sentence matches', () => {
  assert.deepEqual(highlightPassage('Welcome to our page.', 'wheelchair'), [{ text: 'Welcome to our page.', highlight: false }]);
});

test('long passages are cut', () => {
  const parts = highlightPassage('a'.repeat(MAX_PASSAGE_CHARS + 50), 'x');
  assert.equal(parts.map((p) => p.text).join('').length, MAX_PASSAGE_CHARS + 1);
});

test('a policy checked more than 6 months ago is stale', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  assert.equal(isStale('2026-10-13', now), false);
  assert.equal(isStale('2026-04-23', now), false);
  assert.equal(isStale('2026-04-21', now), true);
  assert.equal(isStale(null, now), false);
  assert.equal(isStale('not a date', now), false);
});
