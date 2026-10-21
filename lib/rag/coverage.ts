import { generateText, Output, type LanguageModel } from 'ai';
import { COVERAGE_INSTRUCTIONS, coveragePrompt } from './prompts';
import type { RetrievedChunk } from './types';

export type Coverage = 'covered' | 'not_covered';

// Checks that the passages that passed the similarity gate actually answer the question (R2).
// Fail-safe: any error counts as not covered, which escalates instead of answering.
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
    console.error('coverage check failed, escalating', error);
    return 'not_covered';
  }
}
