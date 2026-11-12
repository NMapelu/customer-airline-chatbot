import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel, LanguageModel } from 'ai';
import type { AiProvider } from './provider';

// The database stores 1536 numbers per passage. OpenAI's model makes exactly that many; Gemini's
// makes 3072, and is trained so that the first 1536 keep most of the meaning, so the schema stays the same.
export const EMBEDDING_DIMENSIONS = 1536;

// Gemini is reached through Google's OpenAI-compatible address, so the app reuses the OpenAI
// library it already has. A separate Google library would push the Worker over the free plan's 3 MB limit.
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

export const MODEL_NAMES = {
  // Answers and follow-up rewrites use gpt-4o: on every eval run gpt-4o-mini mixed up check-in
  // times (online check-in versus airport counters, opening versus closing), and a wrong deadline
  // is the main risk this assistant exists to avoid (threat I5). The scope and coverage checks
  // decide whether to refuse, escalate or answer; on gpt-4o-mini they refused or escalated
  // questions the passages answer, so they use gpt-4o too. The eval judge uses a stronger model
  // than the one it checks; the first run with gpt-4o-mini judging itself failed correct answers.
  openai: { chat: 'gpt-4o', check: 'gpt-4o', judge: 'gpt-4o', embedding: 'text-embedding-3-small' },
  // Gemini Flash is on Google's free tier. Google stopped offering 2.5 Flash to new accounts in 2026,
  // and the newest Flash is often too busy on the free tier, so this is the one before it. Set
  // GEMINI_MODEL to try another without changing code. Not yet calibrated with `npm run eval`.
  google: { chat: 'gemini-3.5-flash', check: 'gemini-3.5-flash', judge: 'gemini-3.5-flash', embedding: 'gemini-embedding-001' },
} as const satisfies Record<AiProvider, { chat: string; check: string; judge: string; embedding: string }>;

export type AiKeys = {
  AI_PROVIDER: AiProvider;
  OPENAI_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  // Optional: another Gemini model for answers and checks, such as gemini-3.8-flash.
  GEMINI_MODEL?: string;
};

// The model names in use, including a GEMINI_MODEL override.
export function modelNames(keys: AiKeys): { chat: string; check: string; judge: string; embedding: string } {
  const names = MODEL_NAMES[keys.AI_PROVIDER];
  if (keys.AI_PROVIDER !== 'google' || !keys.GEMINI_MODEL) return names;
  return { ...names, chat: keys.GEMINI_MODEL, check: keys.GEMINI_MODEL, judge: keys.GEMINI_MODEL };
}

export type Models = {
  chat: LanguageModel;
  check: LanguageModel;
  judge: LanguageModel;
  // 'query' for a user's question, 'document' for a passage being loaded.
  embedding: (purpose: 'query' | 'document') => EmbeddingModel;
};

// Gemini 3 models always "think" before answering, and can't switch it off. These extra tokens let
// the short checks (120 to 200 tokens) still finish their answer after thinking.
const THINKING_ALLOWANCE = 1024;
// When Gemini is busy it can take 30 seconds or more just to say no. Giving up after 20 seconds
// keeps the wait short; each call is still retried twice before the chat says it can't answer.
const REQUEST_TIMEOUT_MS = 20_000;

// Adjusts each request to Gemini's OpenAI-compatible API: the least thinking for answers and checks,
// with room for it in the token limit, and 1536 numbers per embedding. If a longer
// embedding still comes back, only the first 1536 are kept: search compares directions (cosine
// distance), so the shortened vectors don't need rescaling.
export function geminiFetch(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const embeddings = url.endsWith('/embeddings');
    if (typeof init?.body === 'string') {
      const body = JSON.parse(init.body);
      if (embeddings) body.dimensions = EMBEDDING_DIMENSIONS;
      else {
        body.reasoning_effort = 'low';
        if (typeof body.max_tokens === 'number') body.max_tokens += THINKING_ALLOWANCE;
      }
      init = { ...init, body: JSON.stringify(body) };
    }
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const response = await base(input, { ...init, signal });
    if (!embeddings || !response.ok) return response;
    const json = await response.json();
    for (const item of json.data ?? []) {
      if (Array.isArray(item.embedding) && item.embedding.length > EMBEDDING_DIMENSIONS) {
        item.embedding = item.embedding.slice(0, EMBEDDING_DIMENSIONS);
      }
    }
    return Response.json(json, { status: response.status, headers: { 'content-type': 'application/json' } });
  };
}

export function createModels(keys: AiKeys): Models {
  const names = modelNames(keys);
  if (keys.AI_PROVIDER === 'google') {
    const gemini = createOpenAI({ apiKey: keys.GOOGLE_GENERATIVE_AI_API_KEY, baseURL: GEMINI_BASE_URL, fetch: geminiFetch() });
    return {
      chat: gemini.chat(names.chat),
      check: gemini.chat(names.check),
      judge: gemini.chat(names.judge),
      embedding: () => gemini.embedding(names.embedding),
    };
  }
  const openai = createOpenAI({ apiKey: keys.OPENAI_API_KEY });
  return {
    chat: openai(names.chat),
    check: openai(names.check),
    judge: openai(names.judge),
    embedding: () => openai.embedding(names.embedding),
  };
}
