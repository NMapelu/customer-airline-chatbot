import { streamText, type LanguageModel } from 'ai';
import { highlightPassage } from './passages';
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

// One source per document, in retrieval order (R4), with the passages used from it and the
// sentences that match `question` marked. Built from stored chunk data, not the model.
export function sourcesFrom(chunks: RetrievedChunk[], question = ''): Source[] {
  const byDocument = new Map<string, Source>();
  for (const c of chunks) {
    let source = byDocument.get(c.documentId);
    if (!source) {
      source = { title: c.title, section: c.section, url: c.sourceUrl, retrievedAt: c.retrievedAt, audience: c.audience, illustrative: c.illustrative, passages: [] };
      byDocument.set(c.documentId, source);
    }
    source.passages!.push({ section: c.section, parts: highlightPassage(c.content, question) });
  }
  return [...byDocument.values()];
}
