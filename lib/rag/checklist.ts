import { generateText, Output, type EmbeddingModel, type LanguageModel } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { sourcesFrom } from './answer';
import { decide } from './pipeline';
import { CHECKLIST_INSTRUCTIONS, checklistPrompt, TRIP_TOPICS_INSTRUCTIONS, tripPrompt } from './prompts';
import type { Source } from './types';

// Pre-travel checklist (overview §7.10, passengers only). The trip description is split into
// topics; each topic's question goes through the same pipeline as a chat question (scope check,
// retrieval under RLS, confidence gate), and only topics that pass become checklist sections,
// written from their own passages and citing them. The rest are listed for the escalation contact.

export const MAX_TOPICS = 6;

export type ChecklistSection = { topic: string; items: string[]; sources: Source[] };
export type Checklist =
  | { kind: 'checklist'; sections: ChecklistSection[]; uncovered: string[]; blockedStaff: boolean }
  // Not a trip, or nothing in it is about flying with Kenya Airways.
  | { kind: 'refusal' }
  // OpenAI couldn't be reached for a step, so nothing is shown (§10.0 fail-safe).
  | { kind: 'unavailable' };

export type Topic = { topic: string; question: string };

const topicsSchema = z.object({
  topics: z.array(z.object({ topic: z.string(), question: z.string() })),
});

// Cleans the model's topic list: trimmed, of sensible length, no duplicates, at most MAX_TOPICS.
export function cleanTopics(topics: Topic[]): Topic[] {
  const seen = new Set<string>();
  const out: Topic[] = [];
  for (const t of topics) {
    const topic = t.topic.replace(/\s+/g, ' ').trim();
    const question = t.question.replace(/\s+/g, ' ').trim();
    const key = topic.toLowerCase();
    if (!topic || topic.length > 60 || !question || question.length > 300 || seen.has(key)) continue;
    seen.add(key);
    out.push({ topic, question });
    if (out.length === MAX_TOPICS) break;
  }
  return out;
}

// Short checklist items only: anything empty or overlong is dropped.
export function cleanItems(items: string[]): string[] {
  return items
    .map((i) => i.replace(/\s+/g, ' ').trim())
    .filter((i) => i.length > 0 && i.length <= 400)
    .slice(0, 5);
}

export type ChecklistInput = {
  model: LanguageModel;
  checkModel: LanguageModel;
  embeddingModel: EmbeddingModel;
  supabase: SupabaseClient;
  trip: string;
  threshold: number;
};

export async function buildChecklist({ model, checkModel, embeddingModel, supabase, trip, threshold }: ChecklistInput): Promise<Checklist> {
  let topics: Topic[];
  try {
    const { output } = await generateText({
      model,
      instructions: TRIP_TOPICS_INSTRUCTIONS,
      prompt: tripPrompt(trip),
      output: Output.object({ schema: topicsSchema }),
      temperature: 0,
    });
    topics = cleanTopics(output.topics);
  } catch (error) {
    console.error('trip topics failed', error);
    return { kind: 'unavailable' };
  }
  if (topics.length === 0) return { kind: 'refusal' };

  const results = await Promise.all(
    topics.map(async (t) => {
      const decision = await decide({
        model,
        checkModel,
        embeddingModel,
        supabase,
        role: 'customer',
        turns: [{ role: 'user', text: t.question }],
        threshold,
      });
      if (decision.kind !== 'answer') return { topic: t, decision: decision.kind, blockedStaff: decision.kind === 'escalation' && decision.reason === 'blocked_staff' };
      // Customers only ever get public passages; filtering again keeps it that way if that changes.
      const chunks = decision.chunks.filter((c) => c.audience === 'public');
      try {
        const { output } = await generateText({
          model,
          instructions: CHECKLIST_INSTRUCTIONS,
          prompt: checklistPrompt(decision.standalone, chunks),
          output: Output.object({ schema: z.object({ items: z.array(z.string()) }) }),
          temperature: 0,
        });
        const items = cleanItems(output.items);
        if (items.length === 0) return { topic: t, decision: 'escalation' as const, blockedStaff: false };
        return { topic: t, decision: 'answer' as const, blockedStaff: false, section: { topic: t.topic, items, sources: sourcesFrom(chunks, decision.standalone) } };
      } catch (error) {
        console.error('checklist items failed', error);
        return { topic: t, decision: 'unavailable' as const, blockedStaff: false };
      }
    }),
  );

  if (results.some((r) => r.decision === 'unavailable')) return { kind: 'unavailable' };
  const sections = results.flatMap((r) => ('section' in r && r.section ? [r.section] : []));
  const uncovered = results.filter((r) => r.decision === 'escalation').map((r) => r.topic.topic);
  // Every topic was off topic: the message wasn't about a Kenya Airways trip.
  if (sections.length === 0 && uncovered.length === 0) return { kind: 'refusal' };
  return { kind: 'checklist', sections, uncovered, blockedStaff: results.some((r) => r.blockedStaff) };
}
