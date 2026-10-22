import { generateText, type LanguageModel } from 'ai';
import { CUSTOMER_WORDING_INSTRUCTIONS, customerWordingPrompt } from './prompts';
import type { RetrievedChunk } from './types';

// Customer-ready wording for an agent's answer (US-34). Only public passages ever reach this
// call: staff passages are dropped here, whatever the caller passes in, so internal procedures
// can't end up in what the agent reads to a caller (overview §10.11).
// Returns null when no public passage applies or the call fails; the panel then says so.
export async function customerWording(model: LanguageModel, question: string, chunks: RetrievedChunk[]): Promise<string | null> {
  const publicChunks = chunks.filter((c) => c.audience === 'public');
  if (publicChunks.length === 0) return null;
  try {
    const { text } = await generateText({
      model,
      instructions: CUSTOMER_WORDING_INSTRUCTIONS,
      prompt: customerWordingPrompt(question, publicChunks),
      temperature: 0.2,
      maxOutputTokens: 200,
    });
    const wording = text.trim();
    return wording && wording.length <= 2000 ? wording : null;
  } catch (error) {
    console.error('customer-ready wording failed', error);
    return null;
  }
}
