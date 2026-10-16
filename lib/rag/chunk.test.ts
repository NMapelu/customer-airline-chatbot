import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkMarkdown } from './chunk';

const words = (n: number, word = 'policy') => Array.from({ length: n }, (_, i) => `${word}${i}`).join(' ');

test('splits on ## and ### headings and keeps the heading on each chunk', () => {
  const chunks = chunkMarkdown('## Hand baggage\n\nOne bag.\n\n### Weight\n\nUp to the limit.\n\n## Checked baggage\n\nTwo bags.');
  assert.deepEqual(
    chunks.map((c) => c.section),
    ['Hand baggage', 'Weight', 'Checked baggage'],
  );
  assert.equal(chunks[0].content, '## Hand baggage\n\nOne bag.');
  assert.equal(chunks[1].content, '## Weight\n\nUp to the limit.');
});

test('text before the first heading becomes a chunk with no section', () => {
  const chunks = chunkMarkdown('Intro text.\n\n## Rules\n\nA rule.');
  assert.equal(chunks[0].section, null);
  assert.equal(chunks[0].content, 'Intro text.');
});

test('skips headings with no text under them', () => {
  const chunks = chunkMarkdown('## Empty\n\n## Full\n\nSomething.');
  assert.deepEqual(chunks.map((c) => c.section), ['Full']);
});

test('long sections are split into chunks no longer than maxChars', () => {
  const body = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}: ${words(15)}.`).join('\n\n');
  const chunks = chunkMarkdown(`## Long section\n\n${body}`);
  assert.ok(chunks.length > 3);
  for (const chunk of chunks) {
    assert.ok(chunk.content.length <= 800, `chunk is ${chunk.content.length} chars`);
    assert.ok(chunk.content.startsWith('## Long section\n\n'));
  }
});

test('consecutive chunks overlap by up to ~100 characters', () => {
  const body = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}: ${words(15)}.`).join('\n\n');
  const chunks = chunkMarkdown(`## S\n\n${body}`);
  for (let i = 1; i < chunks.length; i++) {
    const previous = chunks[i - 1].content;
    const current = chunks[i].content.replace('## S\n\n', '');
    const overlap = current.split('\n\n')[0];
    assert.ok(previous.endsWith(overlap), `chunk ${i} does not start with the end of chunk ${i - 1}`);
    assert.ok(overlap.length <= 100);
  }
});

test('no text is lost when a section is split', () => {
  const paragraphs = Array.from({ length: 25 }, (_, i) => `Rule ${i} ${words(12)}.`);
  const chunks = chunkMarkdown(`## S\n\n${paragraphs.join('\n\n')}`);
  const all = chunks.map((c) => c.content).join('\n');
  for (const paragraph of paragraphs) assert.ok(all.includes(paragraph), `missing: ${paragraph.slice(0, 20)}`);
});

test('tables are split only between rows', () => {
  const rows = Array.from({ length: 60 }, (_, i) => `| Route ${i} | ${i} kg | Economy and Business |`);
  const table = ['| Route | Weight | Cabin |', '| --- | --- | --- |', ...rows].join('\n');
  const chunks = chunkMarkdown(`## Allowance\n\n${table}`);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    const lines = chunk.content.replace('## Allowance\n\n', '').split('\n').filter(Boolean);
    for (const line of lines) {
      assert.match(line, /^\|.*\|$/, `broken row: ${line}`);
    }
  }
});

test('a single line longer than maxChars is hard-split', () => {
  const chunks = chunkMarkdown(`## S\n\n${'x'.repeat(2000)}`);
  for (const chunk of chunks) assert.ok(chunk.content.length <= 800);
  assert.ok(chunks.map((c) => c.content).join('').replace(/## S\n\n/g, '').length >= 2000);
});

test('headings inside fenced code are not treated as sections', () => {
  const chunks = chunkMarkdown('## Real\n\n```\n## not a heading\n```');
  assert.deepEqual(chunks.map((c) => c.section), ['Real']);
});

test('is deterministic', () => {
  const md = `## A\n\n${words(300)}\n\n## B\n\n${words(50)}`;
  assert.deepEqual(chunkMarkdown(md), chunkMarkdown(md));
});

test('rejects an overlap that is not smaller than the chunk size', () => {
  assert.throws(() => chunkMarkdown('## A\n\ntext', { maxChars: 100, overlapChars: 100 }));
});
