import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from 'ai';
import { COVERAGE_INSTRUCTIONS, coveragePrompt } from './prompts';
import type { RetrievedChunk } from './types';

// 'unavailable': the check itself failed (OpenAI unreachable).
export type Coverage = 'covered' | 'not_covered' | 'unavailable';

// Checks that the passages that passed the similarity gate actually answer the question (R2).
// Fail-safe: a reply that isn't one of the two labels counts as not covered (escalate), and a
// failed call as 'unavailable'; neither answers.
export async function checkCoverage(model: LanguageModel, question: string, chunks: RetrievedChunk[]): Promise<Coverage> {
  try {
    const { output } = await generateText({
      model,
      instructions: COVERAGE_INSTRUCTIONS,
      prompt: coveragePrompt(question, chunks),
      output: Output.choice({ options: ['covered', 'not_covered'] as const }),
      temperature: 0,
    });
    return output === 'covered' ? 'covered' : 'not_covered';
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) return 'not_covered';
    console.error('coverage check failed, nothing will be answered', error);
    return 'unavailable';
  }
}
