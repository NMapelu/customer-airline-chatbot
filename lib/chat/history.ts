import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ChatMessage, MessageKind, Rating, Role, Source, Turn } from '../rag/types';
import type { FeedbackReason } from './feedback';

// Saved conversations (overview §7.2, §8.2 step 9). Every function takes the signed-in user's
// client, so RLS decides what each user can read or change; nothing here filters by user itself.

export const TITLE_MAX = 80;

export type ConversationSummary = { id: string; title: string; updatedAt: string };

// A title from the first question, already masked, cut at a word boundary.
export function titleFrom(question: string): string {
  const flat = question.replace(/\s+/g, ' ').trim();
  if (flat.length <= TITLE_MAX) return flat || 'New conversation';
  const cut = flat.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > TITLE_MAX / 2 ? cut.slice(0, space) : cut}…`;
}

// Opens the conversation, creating it on the first message. The browser picks the id
// (a random UUID), so a new chat has its address before the first answer arrives.
// Returns false when the id belongs to someone else: RLS hides their row and the insert collides.
export async function openConversation(
  supabase: SupabaseClient,
  id: string,
  role: Role,
  firstQuestion: string,
): Promise<boolean> {
  const { data, error } = await supabase.from('conversations').select('id').eq('id', id).maybeSingle();
  if (error) throw new Error(`could not read the conversation: ${error.message}`);
  if (data) return true;
  // The audience must match the caller's real role; the RLS policy rejects anything else.
  const insert = await supabase.from('conversations').insert({ id, audience: role, title: titleFrom(firstQuestion) });
  if (!insert.error) return true;
  if (insert.error.code === '23505') return false;
  throw new Error(`could not create the conversation: ${insert.error.message}`);
}

// The last few turns, oldest first, for the follow-up rewrite and the answer (§7.3).
// History comes from the database, not the request, so a client can't put words in the assistant's mouth.
export async function recentTurns(supabase: SupabaseClient, conversationId: string, limit: number): Promise<Turn[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`could not read the conversation history: ${error.message}`);
  return (data ?? []).reverse().map((m) => ({ role: m.role as Turn['role'], text: m.content as string }));
}

export async function saveMessage(
  supabase: SupabaseClient,
  conversationId: string,
  role: Turn['role'],
  content: string,
  sources: Source[] = [],
  customerWording: string | null = null,
  // `id` lets the route tell the browser the saved answer's id (for feedback and sharing) without
  // reading the row back. `kind` is counted by the insights dashboard (overview §7.13).
  { id, kind }: { id?: string; kind?: MessageKind } = {},
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({ id, conversation_id: conversationId, role, content, sources, customer_wording: customerWording, kind });
  if (error) throw new Error(`could not save the message: ${error.message}`);
  const touch = await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  if (touch.error) throw new Error(`could not update the conversation: ${touch.error.message}`);
}

export async function listConversations(supabase: SupabaseClient, limit = 50): Promise<ConversationSummary[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`could not list conversations: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
}

const sourceSchema = z.object({
  title: z.string(),
  section: z.string().nullable(),
  url: z.string().nullable(),
  retrievedAt: z.string().nullable(),
  audience: z.enum(['public', 'staff']),
  illustrative: z.boolean().optional(),
  // Answers saved before Phase 11 have no passages.
  passages: z
    .array(z.object({ section: z.string().nullable(), parts: z.array(z.object({ text: z.string(), highlight: z.boolean() })) }))
    .optional(),
});
export const sourcesSchema = z.array(sourceSchema).catch([]);

// A saved conversation as chat messages, or null if it doesn't exist or isn't the caller's.
export async function loadConversation(
  supabase: SupabaseClient,
  id: string,
): Promise<{ title: string; audience: Role; messages: ChatMessage[] } | null> {
  const { data: conversation, error } = await supabase.from('conversations').select('title, audience').eq('id', id).maybeSingle();
  if (error) throw new Error(`could not read the conversation: ${error.message}`);
  if (!conversation) return null;
  const { data: rows, error: rowsError } = await supabase
    .from('messages')
    .select('id, role, content, sources, customer_wording')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });
  if (rowsError) throw new Error(`could not read the messages: ${rowsError.message}`);
  const audience: Role = conversation.audience === 'agent' ? 'agent' : 'customer';
  // The user's own ratings on these answers (RLS shows no one else's).
  const answerIds = (rows ?? []).filter((m) => m.role === 'assistant').map((m) => m.id as string);
  const ratings = new Map<string, Rating>();
  if (answerIds.length > 0) {
    const { data: feedback, error: feedbackError } = await supabase
      .from('message_feedback')
      .select('message_id, rating')
      .in('message_id', answerIds);
    if (feedbackError) throw new Error(`could not read the feedback: ${feedbackError.message}`);
    for (const f of feedback ?? []) ratings.set(f.message_id as string, f.rating as Rating);
  }
  const messages: ChatMessage[] = (rows ?? []).map((m) => {
    const sources = sourcesSchema.parse(m.sources);
    // An agent's answer shows its wording panel again, even when there was none to give.
    const wording = audience === 'agent' && sources.length > 0 ? { customerWording: (m.customer_wording as string | null) ?? null } : {};
    return {
      id: m.id,
      role: m.role,
      parts: [{ type: 'text', text: m.content }],
      metadata: m.role === 'assistant' ? { sources, ...wording, messageId: m.id, rating: ratings.get(m.id) } : undefined,
    };
  });
  return { title: conversation.title, audience, messages };
}

// Overview §7.15: conversations whose messages contain the words, newest first. Runs as the
// signed-in user, so RLS limits it to their own messages.
export async function searchConversations(supabase: SupabaseClient, query: string, limit = 20): Promise<ConversationSummary[]> {
  // The words are matched literally: % and _ would otherwise be wildcards.
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await supabase
    .from('messages')
    .select('conversations!inner(id, title, updated_at)')
    .ilike('content', pattern)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`could not search conversations: ${error.message}`);
  const found = new Map<string, ConversationSummary>();
  for (const row of data ?? []) {
    const c = row.conversations as unknown as { id: string; title: string; updated_at: string };
    if (!found.has(c.id)) found.set(c.id, { id: c.id, title: c.title, updatedAt: c.updated_at });
  }
  return [...found.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

export async function renameConversation(supabase: SupabaseClient, id: string, title: string): Promise<boolean> {
  const { data, error } = await supabase.from('conversations').update({ title }).eq('id', id).select('id');
  if (error) throw new Error(`could not rename the conversation: ${error.message}`);
  return (data ?? []).length === 1;
}

// Overview §7.12. RLS only accepts feedback on answers in the caller's own conversations, once each.
// Returns false when the answer isn't theirs or was already rated.
export async function saveFeedback(
  supabase: SupabaseClient,
  messageId: string,
  rating: Rating,
  reason: FeedbackReason | null,
): Promise<boolean> {
  const { error } = await supabase.from('message_feedback').insert({ message_id: messageId, rating, reason: rating === 'down' ? reason : null });
  if (!error) return true;
  // 23505: already rated. 42501: RLS refused (not their answer). 23503: no such message.
  if (['23505', '42501', '23503'].includes(error.code)) return false;
  throw new Error(`could not save the feedback: ${error.message}`);
}

// Permanent: the messages go with it (on delete cascade).
export async function deleteConversation(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.from('conversations').delete().eq('id', id).select('id');
  if (error) throw new Error(`could not delete the conversation: ${error.message}`);
  return (data ?? []).length === 1;
}
