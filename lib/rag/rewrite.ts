import { generateText, type LanguageModel } from 'ai';
import { POLICY_QUERY_INSTRUCTIONS, policyQueryPrompt, REWRITE_INSTRUCTIONS, rewritePrompt } from './prompts';
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

// Restates a standalone question in policy wording for a second retrieval pass. On any error, or
// an empty or overlong reply, it returns the question unchanged and only one search runs.
export async function policyQuery(model: LanguageModel, question: string): Promise<string> {
  try {
    const { text } = await generateText({
      model,
      instructions: POLICY_QUERY_INSTRUCTIONS,
      prompt: policyQueryPrompt(question),
      temperature: 0,
      maxOutputTokens: 120,
    });
    const query = text.trim();
    return query && query.length <= 500 ? query : question;
  } catch (error) {
    console.error('policy query rewrite failed, searching with the question only', error);
    return question;
  }
}
