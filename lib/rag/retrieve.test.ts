import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeResults } from './retrieve';
import type { RetrievedChunk } from './types';

const chunk = (chunkId: number, similarity: number): RetrievedChunk => ({
  chunkId,
  documentId: 'd',
  title: 'Unaccompanied Minors',
  section: null,
  content: `chunk ${chunkId}`,
  audience: 'public',
  illustrative: false,
  sourceUrl: 'https://www.kenya-airways.com/x/',
  retrievedAt: '2026-10-21',
  similarity,
});

test('merged results keep each chunk once at its best similarity, best first', () => {
  const merged = mergeResults(
    [
      [chunk(1, 0.6), chunk(2, 0.5)],
      [chunk(2, 0.7), chunk(3, 0.4)],
    ],
    5,
  );
  assert.deepEqual(
    merged.map((c) => [c.chunkId, c.similarity]),
    [
      [2, 0.7],
      [1, 0.6],
      [3, 0.4],
    ],
  );
});

test('merged results are cut to top K', () => {
  assert.equal(mergeResults([[chunk(1, 0.9), chunk(2, 0.8)], [chunk(3, 0.7)]], 2).length, 2);
});
