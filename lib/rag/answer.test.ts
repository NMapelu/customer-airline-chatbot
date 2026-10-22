import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourcesFrom } from './answer';
import type { RetrievedChunk } from './types';

const chunk = (documentId: string, section: string): RetrievedChunk => ({
  chunkId: 1,
  documentId,
  title: `Doc ${documentId}`,
  section,
  content: 'x',
  audience: 'public',
  illustrative: false,
  sourceUrl: `https://www.kenya-airways.com/${documentId}/`,
  retrievedAt: '2026-10-16',
  similarity: 0.8,
});

test('lists each document once, in retrieval order', () => {
  const sources = sourcesFrom([chunk('b', 'One'), chunk('a', 'Two'), chunk('b', 'Three')]);
  assert.deepEqual(
    sources.map((s) => [s.title, s.section]),
    [
      ['Doc b', 'One'],
      ['Doc a', 'Two'],
    ],
  );
  assert.equal(sources[0].url, 'https://www.kenya-airways.com/b/');
});

test('each source carries its passages, with the matching sentences marked', () => {
  const c = (id: string, section: string, content: string) => ({ ...chunk(id, section), content });
  const [source] = sourcesFrom([c('b', 'One', 'Hello. Bags weigh 23 kg.'), c('b', 'Two', 'Pets travel in the hold.')], 'bags weight');
  assert.deepEqual(source.passages, [
    { section: 'One', parts: [{ text: 'Hello. ', highlight: false }, { text: 'Bags weigh 23 kg.', highlight: true }] },
    { section: 'Two', parts: [{ text: 'Pets travel in the hold.', highlight: false }] },
  ]);
});
