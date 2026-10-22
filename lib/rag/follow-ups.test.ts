import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { parseFollowUps, suggestFollowUps } from './follow-ups';
import type { RetrievedChunk } from './types';

const chunk = (content: string, audience: 'public' | 'staff'): RetrievedChunk => ({
  chunkId: audience === 'public' ? 1 : 2,
  documentId: audience,
  title: audience === 'public' ? 'Baggage Allowance' : 'Refund Procedure',
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

function recording(reply: string | Error) {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      prompts.push(JSON.stringify(prompt));
      if (reply instanceof Error) throw reply;
      return { content: [{ type: 'text', text: reply }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] };
    },
  });
  return { model, prompts };
}

console.error = () => {};

test('up to three short questions are kept, one per line, list markers removed', () => {
  const text = '1. What if my bag is overweight?\n- Can I bring a pram?\nHere are some ideas\n* How much is excess baggage?\n4) Is a fourth one kept?';
  assert.deepEqual(parseFollowUps(text, 'How many bags?'), ['What if my bag is overweight?', 'Can I bring a pram?', 'How much is excess baggage?']);
});

test('repeats, the question itself, links, markup and long lines are dropped', () => {
  const long = `Can I ${'really '.repeat(30)}do it?`;
  const text = `How many bags?\nCan I bring a pram?\ncan i bring a pram?\nSee https://evil.example?\nWhat is <b>this</b>?\n${long}`;
  assert.deepEqual(parseFollowUps(text, 'How many bags?'), ['Can I bring a pram?']);
});

test('suggestions are written from public passages only', async () => {
  const { model, prompts } = recording('What if my bag is overweight?');
  const out = await suggestFollowUps(model, 'How many bags?', [chunk('Two bags of 23 kg.', 'public'), chunk('INTERNAL refund step', 'staff')]);
  assert.deepEqual(out, ['What if my bag is overweight?']);
  assert.match(prompts[0], /Two bags of 23 kg/);
  assert.doesNotMatch(prompts[0], /INTERNAL/);
});

test('no public passages or a failed call gives no suggestions, without calling or throwing', async () => {
  const none = recording('Should not be called?');
  assert.deepEqual(await suggestFollowUps(none.model, 'q', [chunk('INTERNAL', 'staff')]), []);
  assert.equal(none.prompts.length, 0);
  assert.deepEqual(await suggestFollowUps(recording(new Error('down')).model, 'q', [chunk('Two bags.', 'public')]), []);
});
