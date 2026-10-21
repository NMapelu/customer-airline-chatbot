import type { EmbeddingModel, LanguageModel } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TOP_K } from './config';
import { applyGate } from './gate';
import { retrieve } from './retrieve';
import { rewriteQuestion } from './rewrite';
import { checkScope } from './scope';
import type { RetrievedChunk, Role, Turn } from './types';

export type Decision =
  | { kind: 'refusal' }
  | { kind: 'escalation'; reason: 'no_evidence' | 'blocked_staff'; standalone: string; retrieved: RetrievedChunk[] }
  | { kind: 'answer'; standalone: string; retrieved: RetrievedChunk[]; chunks: RetrievedChunk[] };

export type PipelineInput = {
  model: LanguageModel;
  embeddingModel: EmbeddingModel;
  supabase: SupabaseClient;
  role: Role;
  turns: Turn[];
  threshold: number;
};

// Overview §8.2 steps 4–7, shared by the chat route and the evaluation script so both measure
// the same behaviour. It decides what kind of reply to give; generating the answer is separate.
export async function decide({ model, embeddingModel, supabase, role, turns, threshold }: PipelineInput): Promise<Decision> {
  // 5. Scope check (R1) on the user's own words, then 4. rewrite a follow-up for retrieval.
  //    The check runs first because the rewrite could make an off-topic message look in scope.
  if ((await checkScope(model, turns)) === 'off_topic') return { kind: 'refusal' };
  const standalone = await rewriteQuestion(model, turns);

  // 6. Retrieval, under the user's own session and RLS.
  const retrieved = await retrieve(supabase, embeddingModel, standalone, TOP_K);

  // 7. Confidence gate (R2) and the staff-content check (§10.11).
  const gate = applyGate(retrieved, role, threshold);
  if (gate.kind === 'blocked_staff') {
    console.error('blocked staff content from reaching a customer', { chunkIds: gate.chunkIds });
    return { kind: 'escalation', reason: 'blocked_staff', standalone, retrieved };
  }
  if (gate.kind === 'no_evidence') return { kind: 'escalation', reason: 'no_evidence', standalone, retrieved };
  return { kind: 'answer', standalone, retrieved, chunks: gate.chunks };
}
