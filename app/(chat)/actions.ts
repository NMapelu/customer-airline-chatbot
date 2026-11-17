'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import {
  deleteConversation,
  latestAnswerId,
  listConversations,
  renameConversation,
  searchConversations,
  setArchived,
  setPinned,
  TITLE_MAX,
  type ConversationSummary,
} from '@/lib/chat/history';
import { createShare, revokeShare } from '@/lib/chat/shares';
import { audit } from '@/lib/security/audit';
import { requireAal2 } from '@/lib/supabase/server';

const idSchema = z.uuid();
const titleSchema = z.string().trim().min(1).max(TITLE_MAX);
const querySchema = z.string().trim().min(2).max(100);

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
    await audit(supabase, 'conversation_deleted', await headers());
  } catch (error) {
    console.error('delete failed', error);
    return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

// Sidebar menu: pin or unpin, archive or restore. RLS only lets them touch the caller's own rows.
export async function pinConversationAction(id: string, pinned: boolean): Promise<ActionResult> {
  return changeConversation(id, (supabase, convId) => setPinned(supabase, convId, pinned === true));
}

export async function archiveConversationAction(id: string, archived: boolean): Promise<ActionResult> {
  return changeConversation(id, (supabase, convId) => setArchived(supabase, convId, archived === true));
}

async function changeConversation(
  id: string,
  change: (supabase: Awaited<ReturnType<typeof requireAal2>>['supabase'], id: string) => Promise<boolean>,
): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: 'Conversation not found.' };
  const { supabase } = await requireAal2();
  try {
    if (!(await change(supabase, parsedId.data))) return { ok: false, error: 'Conversation not found.' };
  } catch (error) {
    console.error('conversation change failed', error);
    return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

// The archived conversations, for the "Archived" list at the bottom of the sidebar.
export async function listArchivedAction(): Promise<{ ok: true; conversations: ConversationSummary[] } | { ok: false; error: string }> {
  const { supabase } = await requireAal2();
  try {
    return { ok: true, conversations: await listConversations(supabase, { archived: true }) };
  } catch (error) {
    console.error('archived list failed', error);
    return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  }
}

// Overview §7.15. RLS limits the search to the caller's own messages.
export async function searchConversationsAction(
  query: string,
): Promise<{ ok: true; conversations: ConversationSummary[] } | { ok: false; error: string }> {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return { ok: false, error: 'Please type 2 to 100 characters.' };
  const { supabase } = await requireAal2();
  try {
    return { ok: true, conversations: await searchConversations(supabase, parsed.data) };
  } catch (error) {
    console.error('search failed', error);
    return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  }
}

// Overview §7.15: a read-only link to one passenger answer. Agents can't share (checked here
// and again by RLS), since their answers may hold internal procedures.
export async function shareAnswerAction(messageId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsedId = idSchema.safeParse(messageId);
  if (!parsedId.success) return { ok: false, error: 'Answer not found.' };
  const { supabase, role } = await requireAal2();
  if (role === 'agent') return { ok: false, error: "Agent answers can't be shared." };
  try {
    const id = await createShare(supabase, parsedId.data);
    if (!id) return { ok: false, error: 'Answer not found.' };
    return { ok: true, id };
  } catch (error) {
    console.error('share failed', error);
    return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  }
}

export async function revokeShareAction(id: string): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: 'Link not found.' };
  const { supabase } = await requireAal2();
  try {
    if (!(await revokeShare(supabase, parsedId.data))) return { ok: false, error: 'Link not found.' };
  } catch (error) {
    console.error('revoke failed', error);
    return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  }
  revalidatePath('/settings');
  return { ok: true };
}

// Share from the sidebar menu: a link to the conversation's newest answer, the same read-only,
// 30-day link as sharing one answer. Passengers only, as for single answers.
export async function shareConversationAction(conversationId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsedId = idSchema.safeParse(conversationId);
  if (!parsedId.success) return { ok: false, error: 'Conversation not found.' };
  const { supabase, role } = await requireAal2();
  if (role === 'agent') return { ok: false, error: "Agent answers can't be shared." };
  try {
    const answerId = await latestAnswerId(supabase, parsedId.data);
    if (!answerId) return { ok: false, error: 'There is no answer to share yet.' };
    const id = await createShare(supabase, answerId);
    if (!id) return { ok: false, error: 'Conversation not found.' };
    return { ok: true, id };
  } catch (error) {
    console.error('share failed', error);
    return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  }
}
