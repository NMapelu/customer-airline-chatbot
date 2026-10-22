import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import type { RetrievedChunk } from './types';
import { customerWording } from './wording';

const chunk = (content: string, audience: 'public' | 'staff'): RetrievedChunk => ({
  chunkId: audience === 'public' ? 1 : 2,
  documentId: audience,
  title: audience === 'public' ? 'Conditions of Carriage' : 'Missed Connection Handling',
  section: null,
  content,
  audience,
  illustrative: audience === 'staff',
  sourceUrl: null,
  retrievedAt: null,
  similarity: 0.8,
});

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function recording(reply: string) {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      prompts.push(JSON.stringify(prompt));
      return { content: [{ type: 'text', text: reply }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] };
    },
  });
  return { model, prompts };
}

console.error = () => {};

test('the wording call only ever sees public passages', async () => {
  const { model, prompts } = recording('We will rebook you on the next available flight.');
  const wording = await customerWording(model, 'Missed connection?', [
    chunk('KQ rebooks passengers on the next available flight.', 'public'),
    chunk('INTERNAL: approve hotel vouchers in the PSS screen.', 'staff'),
  ]);
  assert.equal(wording, 'We will rebook you on the next available flight.');
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /next available flight/);
  assert.doesNotMatch(prompts[0], /INTERNAL|PSS screen|Missed Connection Handling/);
});

test('no public passage means no wording, and no call', async () => {
  const { model, prompts } = recording('anything');
  assert.equal(await customerWording(model, 'Who approves goodwill?', [chunk('Supervisor approves.', 'staff')]), null);
  assert.equal(prompts.length, 0);
});

test('a failed call means no wording', async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error('network down');
    },
  });
  assert.equal(await customerWording(model, 'Refund?', [chunk('Refunds go to the original payment.', 'public')]), null);
});
