import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// The insights dashboard (overview §7.13, US-21). Everything comes from public.admin_insights(),
// which checks the admin role, writes the audit entry and never returns user ids or emails.

const insightsSchema = z.object({
  daily: z.array(z.object({ day: z.string(), questions: z.number() })),
  monthly: z.array(z.object({ month: z.string(), questions: z.number() })),
  kinds: z.record(z.string(), z.number()),
  topics: z.array(z.object({ title: z.string(), answers: z.number() })),
  escalated: z.array(z.string()),
  feedback: z.object({
    up: z.number(),
    down: z.number(),
    latest_down: z.array(z.object({ at: z.string(), reason: z.string().nullable(), question: z.string().nullable(), answer: z.string() })),
  }),
});

export type Gap = { example: string; count: number };
export type Insights = Omit<z.infer<typeof insightsSchema>, 'escalated'> & { gaps: Gap[] };

// Null when the caller isn't an administrator (the function refuses).
export async function getInsights(supabase: SupabaseClient): Promise<Insights | null> {
  const { data, error } = await supabase.rpc('admin_insights');
  if (error) {
    if (error.code === '42501') return null;
    throw new Error(`could not read the insights: ${error.message}`);
  }
  const { escalated, ...rest } = insightsSchema.parse(data);
  return { ...rest, gaps: groupQuestions(escalated) };
}

const STOP_WORDS = new Set(
  'a an and are as at be can do does for from how i if in is it kenya airways kq my of on or the to what when where which with you your me we our'.split(' '),
);

export function keywords(question: string): Set<string> {
  return new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
      .map((w) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
}

// Knowledge gaps: escalated questions grouped by shared keywords (at least 40% of their combined
// words in common), most frequent first. No model call, so the dashboard costs nothing to open.
export function groupQuestions(questions: string[], threshold = 0.4, limit = 15): Gap[] {
  const groups: { words: Set<string>; example: string; count: number }[] = [];
  for (const question of questions) {
    const words = keywords(question);
    const match = groups.find((g) => similarity(g.words, words) >= threshold);
    if (match) match.count += 1;
    else groups.push({ words, example: question, count: 1 });
  }
  return groups
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ example, count }) => ({ example, count }));
}
