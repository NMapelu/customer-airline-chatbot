import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { rewriteQuestion } from './rewrite';
import { checkScope } from './scope';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const replying = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      warnings: [],
    }),
  });
const failing = () =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error('network down');
    },
  });

// The tests expect errors to be logged; keep the output readable.
console.error = () => {};

const ask = (text: string) => [{ role: 'user' as const, text }];

test('scope check returns the model label', async () => {
  assert.equal(await checkScope(replying('{"result":"in_scope"}'), ask('How many bags?')), 'in_scope');
  assert.equal(await checkScope(replying('{"result":"off_topic"}'), ask('Who wins the league?')), 'off_topic');
});

test('scope check fails safe to off topic', async () => {
  assert.equal(await checkScope(failing(), ask('How many bags?')), 'off_topic');
  assert.equal(await checkScope(replying('not json'), ask('How many bags?')), 'off_topic');
});

test("scope check sees the user's own latest words, not a rewrite", async () => {
  const model = replying('{"result":"off_topic"}');
  const turns = [
    { role: 'user' as const, text: 'How many bags in Economy?' },
    { role: 'assistant' as const, text: 'Two bags.' },
    { role: 'user' as const, text: 'Who will win the Premier League?' },
  ];
  await checkScope(model, turns);
  const prompt = JSON.stringify(model.doGenerateCalls[0].prompt);
  assert.match(prompt, /User: Who will win the Premier League\?/);
  assert.match(prompt, /User: How many bags in Economy\?/);
});

test('a first question is not rewritten', async () => {
  const model = replying('should not be used');
  assert.equal(await rewriteQuestion(model, [{ role: 'user', text: 'How many bags?' }]), 'How many bags?');
  assert.equal(model.doGenerateCalls.length, 0);
});

test('a follow-up is rewritten, and falls back to the original on error', async () => {
  const turns = [
    { role: 'user' as const, text: 'How many bags in Economy?' },
    { role: 'assistant' as const, text: 'Two bags.' },
    { role: 'user' as const, text: 'and Business?' },
  ];
  assert.equal(await rewriteQuestion(replying(' How many bags in Business Class? '), turns), 'How many bags in Business Class?');
  assert.equal(await rewriteQuestion(failing(), turns), 'and Business?');
});
