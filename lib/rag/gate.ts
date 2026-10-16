import type { RetrievedChunk, Role } from './types';

export type GateResult =
  | { kind: 'answer'; chunks: RetrievedChunk[] }
  | { kind: 'no_evidence' }
  | { kind: 'blocked_staff'; chunkIds: number[] };

// The confidence gate (R2) and the second staff-content check (overview §10.11).
// RLS already keeps staff chunks away from customers; this check is defense in depth, so a
// staff chunk reaching a customer is treated as a fault and nothing is generated from it.
export function applyGate(chunks: RetrievedChunk[], role: Role, threshold: number): GateResult {
  if (role !== 'agent') {
    const leaked = chunks.filter((c) => c.audience !== 'public');
    if (leaked.length > 0) return { kind: 'blocked_staff', chunkIds: leaked.map((c) => c.chunkId) };
  }
  const passing = chunks.filter((c) => Number.isFinite(c.similarity) && c.similarity >= threshold);
  return passing.length > 0 ? { kind: 'answer', chunks: passing } : { kind: 'no_evidence' };
}
