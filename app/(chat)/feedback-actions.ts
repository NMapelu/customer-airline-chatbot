'use server';

import { z } from 'zod';
import { saveFeedback } from '@/lib/chat/history';
import { FEEDBACK_REASONS } from '@/lib/chat/feedback';
import { requireAal2 } from '@/lib/supabase/server';
import type { ActionResult } from './actions';

const feedbackSchema = z.object({
  messageId: z.uuid(),
  rating: z.enum(['up', 'down']),
  reason: z.enum(Object.keys(FEEDBACK_REASONS) as [keyof typeof FEEDBACK_REASONS]).nullable(),
});

// Overview §7.12. Runs as the signed-in user, so RLS decides which answers they may rate.
export async function giveFeedbackAction(messageId: string, rating: string, reason: string | null): Promise<ActionResult> {
  const parsed = feedbackSchema.safeParse({ messageId, rating, reason });
  if (!parsed.success) return { ok: false, error: 'Invalid feedback.' };
  const { supabase } = await requireAal2();
  try {
    if (!(await saveFeedback(supabase, parsed.data.messageId, parsed.data.rating, parsed.data.reason))) {
      return { ok: false, error: 'You have already rated this answer.' };
    }
  } catch (error) {
    console.error('feedback failed', error);
    return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  }
  return { ok: true };
}
