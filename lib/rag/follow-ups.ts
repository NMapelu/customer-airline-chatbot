import { generateText, type LanguageModel } from 'ai';
import { FOLLOW_UP_INSTRUCTIONS, followUpPrompt } from './prompts';
import type { RetrievedChunk } from './types';

// Suggested follow-up questions (overview §7.9, US-25). Written only from the passages the answer
// used, so tapping one leads to a question the knowledge base covers. Public passages only:
// a suggestion is shown as a button and sent as the user's own words.
export const MAX_FOLLOW_UPS = 3;
const MAX_FOLLOW_UP_CHARS = 120;

// One question per line. Anything that doesn't look like a short question is dropped, so a stray
// reply never turns into a button.
export function parseFollowUps(text: string, question: string): string[] {
  const asked = question.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const q = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
    const key = q.toLowerCase();
    if (!q.endsWith('?') || q.length < 8 || q.length > MAX_FOLLOW_UP_CHARS || key === asked || seen.has(key)) continue;
    if (/[<>[\]{}`]|https?:/i.test(q)) continue;
    seen.add(key);
    out.push(q);
    if (out.length === MAX_FOLLOW_UPS) break;
  }
  return out;
}

// Returns no suggestions when there are no public passages or the call fails: they are optional.
export async function suggestFollowUps(model: LanguageModel, question: string, chunks: RetrievedChunk[]): Promise<string[]> {
  const publicChunks = chunks.filter((c) => c.audience === 'public');
  if (publicChunks.length === 0) return [];
  try {
    const { text } = await generateText({
      model,
      instructions: FOLLOW_UP_INSTRUCTIONS,
      prompt: followUpPrompt(question, publicChunks),
      temperature: 0.3,
      maxOutputTokens: 120,
    });
    return parseFollowUps(text, question);
  } catch (error) {
    console.error('follow-up suggestions failed', error);
    return [];
  }
}
