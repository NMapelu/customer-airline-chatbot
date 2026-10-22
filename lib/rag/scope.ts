import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from 'ai';
import { rewritePrompt, scopeInstructions } from './prompts';
import type { Role, Turn } from './types';

// 'unavailable': the check itself failed (OpenAI unreachable), so nothing can be answered.
export type Scope = 'in_scope' | 'off_topic' | 'unavailable';

// Labels the user's latest message in scope or off topic (R1). It reads the user's own words with
// the earlier turns as context, never the rewritten question: the rewrite can make an off-topic
// message sound like a policy question. Fail-safe: a reply that isn't one of the two labels counts
// as off topic, and a failed call as 'unavailable'; neither lets the question through.
export async function checkScope(model: LanguageModel, turns: Turn[], role: Role = 'customer'): Promise<Scope> {
  try {
    const { output } = await generateText({
      model,
      instructions: scopeInstructions(role),
      prompt: rewritePrompt(turns),
      output: Output.choice({ options: ['in_scope', 'off_topic'] as const }),
      temperature: 0,
    });
    return output === 'in_scope' ? 'in_scope' : 'off_topic';
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) return 'off_topic';
    console.error('scope check failed, nothing will be answered', error);
    return 'unavailable';
  }
}
