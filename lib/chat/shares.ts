import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Source } from '../rag/types';
import { sourcesSchema } from './history';

// Shared answers (overview §7.15). Creating, listing and revoking run as the signed-in user, so RLS
// limits them to the caller's own passenger answers. Reading a link runs through
// public.get_shared_answer, which returns nothing about who shared it.

export const SHARE_DAYS = 30;

export type ShareSummary = { id: string; createdAt: string; expiresAt: string };

// Returns the new link's id, or null when the answer isn't the caller's (or is an agent answer).
export async function createShare(supabase: SupabaseClient, messageId: string): Promise<string | null> {
  const { data, error } = await supabase.from('shared_answers').insert({ message_id: messageId }).select('id').single();
  if (!error) return data.id as string;
  if (['42501', '23503'].includes(error.code)) return null;
  throw new Error(`could not share the answer: ${error.message}`);
}

export async function revokeShare(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.from('shared_answers').update({ revoked: true }).eq('id', id).select('id');
  if (error) throw new Error(`could not revoke the link: ${error.message}`);
  return (data ?? []).length === 1;
}

// The caller's links that still work, newest first.
export async function listShares(supabase: SupabaseClient): Promise<ShareSummary[]> {
  const { data, error } = await supabase
    .from('shared_answers')
    .select('id, created_at, expires_at')
    .eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`could not list shared links: ${error.message}`);
  return (data ?? []).map((s) => ({ id: s.id, createdAt: s.created_at, expiresAt: s.expires_at }));
}

export type SharedAnswer = { question: string | null; answer: string; sources: Source[]; answeredAt: string };

// null when the link doesn't exist, was revoked or has expired: the page says the same for all three.
export async function getSharedAnswer(supabase: SupabaseClient, id: string): Promise<SharedAnswer | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await supabase.rpc('get_shared_answer', { p_id: id });
  if (error) throw new Error(`could not read the shared answer: ${error.message}`);
  const row = (data ?? [])[0];
  if (!row) return null;
  return { question: row.question, answer: row.answer, sources: sourcesSchema.parse(row.sources), answeredAt: row.answered_at };
}
