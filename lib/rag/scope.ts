import { generateText, Output, type LanguageModel } from 'ai';
import { SCOPE_INSTRUCTIONS } from './prompts';

export type Scope = 'in_scope' | 'off_topic';

// Labels a question in scope or off topic (R1). Fail-safe: any error counts as off topic,
// so a broken classifier refuses instead of answering.
export async function checkScope(model: LanguageModel, question: string): Promise<Scope> {
  try {
    const { output } = await generateText({
      model,
      instructions: SCOPE_INSTRUCTIONS,
      prompt: `<question>\n${question}\n</question>`,
      output: Output.choice({ options: ['in_scope', 'off_topic'] as const }),
      temperature: 0,
    });
    return output === 'in_scope' ? 'in_scope' : 'off_topic';
  } catch (error) {
    console.error('scope check failed, treating the question as off topic', error);
    return 'off_topic';
  }
}
