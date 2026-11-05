import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { embed, generateText } from 'ai';
import { createModels, modelNames } from './models';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Records what would be sent to Google and answers like its OpenAI-compatible API.
function fakeGoogle(embeddingLength: number) {
  const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init.body)) });
    if (String(url).endsWith('/embeddings')) {
      return Response.json({ data: [{ index: 0, embedding: new Array(embeddingLength).fill(0.01) }], usage: { prompt_tokens: 3 } });
    }
    return Response.json({
      id: 'x', created: 0, model: 'gemini-3.5-flash',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 1 },
    });
  }) as typeof fetch;
  return sent;
}

const google = () => createModels({ AI_PROVIDER: 'google', GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' });

test('Gemini embeddings ask for 1536 numbers and are cut to 1536 if more come back', async () => {
  const sent = fakeGoogle(3072);
  const { embedding } = await embed({ model: google().embedding('query'), value: 'How many bags can I check?' });
  assert.equal(embedding.length, 1536);
  assert.match(sent[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai\/embeddings$/);
  assert.equal(sent[0].body.model, 'gemini-embedding-001');
  assert.equal(sent[0].body.dimensions, 1536);
});

test('Gemini thinks as little as possible, with room for it in the token limit', async () => {
  const sent = fakeGoogle(1536);
  const { text } = await generateText({ model: google().check, prompt: 'Hi', maxOutputTokens: 50 });
  assert.equal(text, 'Hello');
  assert.match(sent[0].url, /\/v1beta\/openai\/chat\/completions$/);
  assert.equal(sent[0].body.model, 'gemini-3.5-flash');
  assert.equal(sent[0].body.reasoning_effort, 'low');
  assert.equal(sent[0].body.max_tokens, 50 + 1024);
});

test('GEMINI_MODEL picks another model for answers and checks, not for search', () => {
  const keys = { AI_PROVIDER: 'google', GOOGLE_GENERATIVE_AI_API_KEY: 'k', GEMINI_MODEL: 'gemini-3.8-flash' } as const;
  const models = createModels(keys);
  assert.equal((models.check as { modelId: string }).modelId, 'gemini-3.8-flash');
  assert.equal((models.embedding('query') as { modelId: string }).modelId, 'gemini-embedding-001');
  assert.equal(modelNames({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', GEMINI_MODEL: 'x' }).chat, 'gpt-4o');
});

test('OpenAI stays the default set of models', () => {
  const models = createModels({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key' });
  assert.equal((models.chat as { modelId: string }).modelId, 'gpt-4o');
  assert.equal((models.embedding('query') as { modelId: string }).modelId, 'text-embedding-3-small');
});
