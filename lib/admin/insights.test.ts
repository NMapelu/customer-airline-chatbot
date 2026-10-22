import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupQuestions, keywords } from './insights';

test('keywords drop filler words and plurals', () => {
  assert.deepEqual([...keywords('Can I take my e-bike batteries on Kenya Airways?')], ['take', 'bike', 'battery']);
});

test('escalated questions are grouped by shared words, biggest group first', () => {
  const gaps = groupQuestions([
    'Can I bring an e-bike battery?',
    'Is a surfboard allowed?',
    'Can I take my e-bike battery on board?',
    'e-bike battery in checked bags',
  ]);
  assert.equal(gaps.length, 2);
  assert.deepEqual(gaps[0], { example: 'Can I bring an e-bike battery?', count: 3 });
  assert.deepEqual(gaps[1], { example: 'Is a surfboard allowed?', count: 1 });
});
