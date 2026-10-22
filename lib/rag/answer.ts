import { streamText, type LanguageModel } from 'ai';
import { answerInstructions } from './prompts';
import type { RetrievedChunk, Role, Source, Turn } from './types';

// Generates the grounded answer from the fixed prompt, the passages and the last few turns
// (overview §8.2 step 8). The model has no tools (R5).
export function streamAnswer(model: LanguageModel, role: Role, chunks: RetrievedChunk[], turns: Turn[]) {
  return streamText({
    model,
    instructions: answerInstructions(role, chunks),
    messages: turns.map((t) => ({ role: t.role, content: t.text })),
    temperature: 0.2,
    maxOutputTokens: 700,
    // Full details go to the server log (`npx wrangler tail`); the browser only gets a generic message.
    onError({ error }) {
      console.error('answer stream failed', error);
    },
  });
}

// One source per document, in retrieval order (R4). Built from stored chunk data, not the model.
export function sourcesFrom(chunks: RetrievedChunk[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const c of chunks) {
    if (seen.has(c.documentId)) continue;
    seen.add(c.documentId);
    out.push({ title: c.title, section: c.section, url: c.sourceUrl, retrievedAt: c.retrievedAt, audience: c.audience, illustrative: c.illustrative });
  }
  return out;
}
