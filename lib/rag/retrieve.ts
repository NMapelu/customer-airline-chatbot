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

// Combines the results of several searches by taking turns: the first search's best chunk, then
// the second's, and so on, skipping chunks already taken. Each search keeps its share of the top K,
// so a reworded query can add passages but never crowd out what the user's own question found.
// Each chunk keeps its own similarity for the threshold.
export function mergeResults(lists: RetrievedChunk[][], topK: number): RetrievedChunk[] {
  const merged: RetrievedChunk[] = [];
  const seen = new Set<number>();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let rank = 0; rank < longest && merged.length < topK; rank += 1) {
    for (const list of lists) {
      const chunk = list[rank];
      if (!chunk || seen.has(chunk.chunkId) || merged.length >= topK) continue;
      seen.add(chunk.chunkId);
      merged.push(chunk);
    }
  }
  return merged;
}
