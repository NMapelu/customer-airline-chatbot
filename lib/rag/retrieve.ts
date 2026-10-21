import { embed, type EmbeddingModel } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RetrievedChunk } from './types';

type MatchRow = {
  chunk_id: number;
  document_id: string;
  title: string;
  section: string | null;
  content: string;
  audience: 'public' | 'staff';
  illustrative: boolean;
  source_url: string | null;
  retrieved_at: string | null;
  similarity: number;
};

// Embeds the question and searches the knowledge base (overview §8.2 step 6).
// `supabase` must carry the user's own session: match_documents runs as the caller, so RLS
// decides which audiences come back. The app never filters by role itself.
export async function retrieve(
  supabase: SupabaseClient,
  embeddingModel: EmbeddingModel,
  question: string,
  topK: number,
): Promise<RetrievedChunk[]> {
  const { embedding } = await embed({ model: embeddingModel, value: question });
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: JSON.stringify(embedding),
    match_count: topK,
  });
  if (error) throw new Error(`match_documents failed: ${error.message}`);
  return ((data ?? []) as MatchRow[]).map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    title: r.title,
    section: r.section,
    content: r.content,
    audience: r.audience,
    illustrative: r.illustrative,
    sourceUrl: r.source_url,
    retrievedAt: r.retrieved_at,
    similarity: r.similarity,
  }));
}

// Combines the results of several searches: each chunk once, at its best similarity, best first.
export function mergeResults(lists: RetrievedChunk[][], topK: number): RetrievedChunk[] {
  const best = new Map<number, RetrievedChunk>();
  for (const chunk of lists.flat()) {
    const seen = best.get(chunk.chunkId);
    if (!seen || chunk.similarity > seen.similarity) best.set(chunk.chunkId, chunk);
  }
  return [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}
