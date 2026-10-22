// The staff-content guard (overview §10.11, build guide Phase 9 step 3): even if a fault made
// retrieval return a staff passage for a customer, nothing is generated from it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test';
import { decide } from './pipeline';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const reply = (text: string) => ({ content: [{ type: 'text' as const, text }], finishReason: { unified: 'stop' as const, raw: undefined }, usage, warnings: [] });

// A database that wrongly returns a staff passage to whoever asks: the fault the guard is for.
function leakyDatabase(): SupabaseClient {
  const row = (id: number, audience: 'public' | 'staff') => ({
    chunk_id: id,
    document_id: `doc-${id}`,
    title: audience === 'staff' ? 'Missed Connection Handling' : 'Conditions of Carriage',
    section: null,
    content: audience === 'staff' ? 'INTERNAL: approve hotel vouchers in the PSS screen.' : 'KQ rebooks passengers.',
    audience,
    illustrative: audience === 'staff',
    source_url: null,
    retrieved_at: null,
    similarity: 0.9,
  });
  return { rpc: async () => ({ data: [row(1, 'public'), row(2, 'staff')], error: null }) } as unknown as SupabaseClient;
}

const embeddingModel = new MockEmbeddingModelV4({ doEmbed: async () => ({ embeddings: [[1, 0, 0]], warnings: [] }) });
const turns = [{ role: 'user' as const, text: 'I missed my connection in Nairobi. What happens now?' }];

console.error = () => {};

test('a staff passage reaching a customer is blocked before anything is generated', async () => {
  const calls: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const text = JSON.stringify(prompt);
      calls.push(text);
      // Scope check says in scope; the policy-wording rewrite returns the question.
      return reply(text.includes('in_scope') ? '{"result":"in_scope"}' : 'missed connection rebooking');
    },
  });
  const decision = await decide({ model, checkModel: model, embeddingModel, supabase: leakyDatabase(), role: 'customer', turns, threshold: 0.38 });
  assert.equal(decision.kind, 'escalation');
  assert.equal(decision.kind === 'escalation' && decision.reason, 'blocked_staff');
  // No model call after retrieval ever saw the staff text (the coverage check never ran).
  assert.ok(calls.every((c) => !c.includes('PSS screen')));
});

test('the same passages are fine for an agent', async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const text = JSON.stringify(prompt);
      if (text.includes('in_scope')) return reply('{"result":"in_scope"}');
      if (text.includes('not_covered')) return reply('{"result":"covered"}');
      return reply('missed connection rebooking');
    },
  });
  const decision = await decide({ model, checkModel: model, embeddingModel, supabase: leakyDatabase(), role: 'agent', turns, threshold: 0.38 });
  assert.equal(decision.kind, 'answer');
  assert.deepEqual(decision.kind === 'answer' && decision.chunks.map((c) => c.audience), ['public', 'staff']);
});

test('when OpenAI is unreachable nothing is answered, and it says so', async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error('Incorrect API key provided');
    },
  });
  const decision = await decide({ model, checkModel: model, embeddingModel, supabase: leakyDatabase(), role: 'customer', turns, threshold: 0.38 });
  assert.deepEqual(decision, { kind: 'unavailable' });
});
