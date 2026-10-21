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

test('merged results take turns between searches and keep each chunk once', () => {
  const merged = mergeResults(
    [
      [chunk(1, 0.6), chunk(2, 0.5)],
      [chunk(3, 0.9), chunk(1, 0.7), chunk(4, 0.4)],
    ],
    5,
  );
  assert.deepEqual(
    merged.map((c) => [c.chunkId, c.similarity]),
    [
      [1, 0.6],
      [3, 0.9],
      [2, 0.5],
      [4, 0.4],
    ],
  );
});

test("a reworded query can't crowd out the question's own best chunks", () => {
  const direct = [chunk(1, 0.6), chunk(2, 0.55), chunk(3, 0.5), chunk(4, 0.45)];
  const reworded = [chunk(11, 0.8), chunk(12, 0.79), chunk(13, 0.78), chunk(14, 0.77)];
  assert.deepEqual(
    mergeResults([direct, reworded], 4).map((c) => c.chunkId),
    [1, 11, 2, 12],
  );
});

test('merged results are cut to top K', () => {
  assert.equal(mergeResults([[chunk(1, 0.9), chunk(2, 0.8)], [chunk(3, 0.7)]], 2).length, 2);
});
