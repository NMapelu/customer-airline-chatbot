'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { deleteConversation, renameConversation, TITLE_MAX } from '@/lib/chat/history';
import { requireAal2 } from '@/lib/supabase/server';

const idSchema = z.uuid();
const titleSchema = z.string().trim().min(1).max(TITLE_MAX);

export type ActionResult = { ok: true } | { ok: false; error: string };

// US-12. Both run as the signed-in user, so RLS only lets them touch their own conversations.
export async function renameConversationAction(id: string, title: string): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(id);
  const parsedTitle = titleSchema.safeParse(title);
  if (!parsedId.success) return { ok: false, error: 'Conversation not found.' };
  if (!parsedTitle.success) return { ok: false, error: `Please use 1 to ${TITLE_MAX} characters.` };
  const { supabase } = await requireAal2();
  try {
    if (!(await renameConversation(supabase, parsedId.data, parsedTitle.data))) {
      return { ok: false, error: 'Conversation not found.' };
    }
  } catch (error) {
    console.error('rename failed', error);
    return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteConversationAction(id: string): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: 'Conversation not found.' };
  const { supabase } = await requireAal2();
  try {
    if (!(await deleteConversation(supabase, parsedId.data))) return { ok: false, error: 'Conversation not found.' };
  } catch (error) {
    console.error('delete failed', error);
    return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
