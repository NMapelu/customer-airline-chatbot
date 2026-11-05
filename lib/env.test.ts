import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getServerEnv } from './env';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function setEnv(values: Record<string, string>) {
  for (const key of ['AI_PROVIDER', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']) delete process.env[key];
  Object.assign(process.env, { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_ANON_KEY: 'anon' }, values);
}

test('OpenAI is the default and needs its key', () => {
  setEnv({ OPENAI_API_KEY: 'sk-test' });
  assert.equal(getServerEnv().AI_PROVIDER, 'openai');
  setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'g-test' });
  assert.throws(() => getServerEnv(), /OPENAI_API_KEY: is required when AI_PROVIDER is openai/);
});

test('Gemini needs only the Google key, and an empty OpenAI line is fine', () => {
  setEnv({ AI_PROVIDER: 'google', GOOGLE_GENERATIVE_AI_API_KEY: 'g-test', OPENAI_API_KEY: '' });
  assert.equal(getServerEnv().AI_PROVIDER, 'google');
  setEnv({ AI_PROVIDER: 'google', OPENAI_API_KEY: 'sk-test' });
  assert.throws(() => getServerEnv(), /GOOGLE_GENERATIVE_AI_API_KEY: is required when AI_PROVIDER is google/);
});

test('an unknown provider stops the app', () => {
  setEnv({ AI_PROVIDER: 'other', OPENAI_API_KEY: 'sk-test' });
  assert.throws(() => getServerEnv(), /AI_PROVIDER/);
});
