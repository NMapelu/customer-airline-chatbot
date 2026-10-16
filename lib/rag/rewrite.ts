import { generateText, type LanguageModel } from 'ai';
import { REWRITE_INSTRUCTIONS, rewritePrompt } from './prompts';
import type { Turn } from './types';

// Turns a follow-up like "and for Business Class?" into a standalone question for retrieval,
// using the last few turns (overview §7.3). On any error it falls back to the user's own words:
// the scope check and confidence gate still run on whatever comes back.
export async function rewriteQuestion(model: LanguageModel, turns: Turn[]): Promise<string> {
  const latest = turns.at(-1)?.text ?? '';
  if (turns.filter((t) => t.role === 'user').length < 2) return latest;
  try {
    const { text } = await generateText({
      model,
      instructions: REWRITE_INSTRUCTIONS,
      prompt: rewritePrompt(turns),
      temperature: 0,
      maxOutputTokens: 120,
    });
    const question = text.trim();
    return question && question.length <= 500 ? question : latest;
  } catch (error) {
    console.error('question rewrite failed, using the original message', error);
    return latest;
  }
}
