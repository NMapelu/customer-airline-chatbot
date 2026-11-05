import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideFromProbability, forestScope, normalise, offTopicProbability, type Forest } from './forest';

// One split on feature 0 at 0.5: left leaf (node 1) and right leaf (node 2).
const tree = { feature: [0, -2, -2], threshold: [0.5, -2, -2], left: [1, -1, -1], right: [2, -1, -1], p_off: [0, 0.9, 0.1] };
const forest: Forest = { band: [0.3, 0.7], trees: [tree, { ...tree, p_off: [0, 0.7, 0.3] }] };

test('the forest averages the leaf each tree reaches', () => {
  assert.ok(Math.abs(offTopicProbability(forest, [0.2]) - 0.8) < 1e-9);
  assert.ok(Math.abs(offTopicProbability(forest, [0.6]) - 0.2) < 1e-9);
  // Exactly at the threshold goes left, as in scikit-learn.
  assert.ok(Math.abs(offTopicProbability(forest, [0.5]) - 0.8) < 1e-9);
});

test('the forest decides alone only outside the band', () => {
  assert.equal(decideFromProbability(0.8, [0.3, 0.7]), 'off_topic');
  assert.equal(decideFromProbability(0.2, [0.3, 0.7]), 'in_scope');
  assert.equal(decideFromProbability(0.5, [0.3, 0.7]), 'unsure');
  assert.equal(decideFromProbability(0.7, [0.3, 0.7]), 'unsure');
  assert.equal(decideFromProbability(0.3, [0.3, 0.7]), 'unsure');
});

test('vectors are scaled to length 1', () => {
  assert.deepEqual(normalise([3, 4]), [0.6, 0.8]);
  assert.deepEqual(normalise([0, 0]), [0, 0]);
});

test('outside a Worker the forest is unsure, so the gpt-4o check runs', async () => {
  assert.equal(await forestScope([{ role: 'user', text: 'How many bags can I check?' }]), 'unsure');
});
