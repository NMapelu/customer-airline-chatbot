import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanItems, cleanTopics, MAX_TOPICS } from './checklist';

test('trip topics are trimmed, de-duplicated and capped', () => {
  const topics = cleanTopics([
    { topic: ' Travelling with a cat ', question: 'Can I take my cat?' },
    { topic: 'travelling with a cat', question: 'Again?' },
    { topic: '', question: 'No label?' },
    { topic: 'Wheelchair', question: '  ' },
    { topic: 'x'.repeat(61), question: 'Too long?' },
    ...Array.from({ length: 10 }, (_, i) => ({ topic: `Topic ${i}`, question: `Question ${i}?` })),
  ]);
  assert.equal(topics.length, MAX_TOPICS);
  assert.deepEqual(topics[0], { topic: 'Travelling with a cat', question: 'Can I take my cat?' });
  assert.equal(topics[1].topic, 'Topic 0');
});

test('checklist items keep up to five short items', () => {
  assert.deepEqual(cleanItems(['  Book  ahead ', '', 'x'.repeat(401), 'a', 'b', 'c', 'd', 'e']), ['Book ahead', 'a', 'b', 'c', 'd']);
});
