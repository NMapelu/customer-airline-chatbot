import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyGate } from './gate';
import type { RetrievedChunk } from './types';

const chunk = (chunkId: number, similarity: number, audience: 'public' | 'staff' = 'public'): RetrievedChunk => ({
  chunkId,
  documentId: `d${chunkId}`,
  title: 'T',
  section: null,
  content: 'text',
  audience,
  illustrative: audience === 'staff',
  sourceUrl: null,
  retrievedAt: null,
  similarity,
});

test('passes chunks at or above the threshold', () => {
  const result = applyGate([chunk(1, 0.7), chunk(2, 0.4), chunk(3, 0.39)], 'customer', 0.4);
  assert.equal(result.kind, 'answer');
  assert.deepEqual(result.kind === 'answer' && result.chunks.map((c) => c.chunkId), [1, 2]);
});

test('escalates when nothing reaches the threshold or nothing was found', () => {
  assert.deepEqual(applyGate([chunk(1, 0.2)], 'customer', 0.4), { kind: 'no_evidence' });
  assert.deepEqual(applyGate([], 'customer', 0.4), { kind: 'no_evidence' });
});

test('treats a non-number similarity as no evidence', () => {
  assert.deepEqual(applyGate([chunk(1, Number.NaN)], 'customer', 0.4), { kind: 'no_evidence' });
});

test('blocks a customer answer if any staff chunk came back, even a weak one', () => {
  assert.deepEqual(applyGate([chunk(1, 0.9), chunk(2, 0.1, 'staff')], 'customer', 0.4), {
    kind: 'blocked_staff',
    chunkIds: [2],
  });
});

test('lets agents use staff chunks', () => {
  const result = applyGate([chunk(1, 0.9, 'staff')], 'agent', 0.4);
  assert.equal(result.kind, 'answer');
});
