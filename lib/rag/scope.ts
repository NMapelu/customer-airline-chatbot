import { generateText, Output, type LanguageModel } from 'ai';
import { rewritePrompt, SCOPE_INSTRUCTIONS } from './prompts';
import type { Turn } from './types';

export type Scope = 'in_scope' | 'off_topic';

// Labels the user's latest message in scope or off topic (R1). It reads the user's own words with
// the earlier turns as context, never the rewritten question: the rewrite can make an off-topic
// message sound like a policy question. Fail-safe: any error counts as off topic.
export async function checkScope(model: LanguageModel, turns: Turn[]): Promise<Scope> {
  try {
    const { output } = await generateText({
      model,
      instructions: SCOPE_INSTRUCTIONS,
      prompt: rewritePrompt(turns),
      output: Output.choice({ options: ['in_scope', 'off_topic'] as const }),
      temperature: 0,
    });
    return output === 'in_scope' ? 'in_scope' : 'off_topic';
  } catch (error) {
    console.error('scope check failed, treating the question as off topic', error);
    return 'off_topic';
  }
}
