import type { UIMessage } from 'ai';

export type Role = 'customer' | 'agent';

export type Turn = { role: 'user' | 'assistant'; text: string };

export type RetrievedChunk = {
  chunkId: number;
  documentId: string;
  title: string;
  section: string | null;
  content: string;
  audience: 'public' | 'staff';
  illustrative: boolean;
  sourceUrl: string | null;
  retrievedAt: string | null;
  similarity: number;
};

// A piece of a source passage; `highlight` marks the sentences that best match the question (US-22).
export type PassagePart = { text: string; highlight: boolean };

// What the browser gets under each answer (R4). Built from stored chunks, never from the model.
export type Source = {
  title: string;
  section: string | null;
  url: string | null;
  retrievedAt: string | null;
  audience: 'public' | 'staff';
  // A sample staff procedure written for this project, not a real KQ document (overview §9.1a).
  illustrative?: boolean;
  // The stored passages the answer used from this document, for the preview (overview §7.6).
  passages?: { section: string | null; parts: PassagePart[] }[];
};

export type ChatMetadata = {
  kind?: 'answer' | 'refusal' | 'escalation' | 'unavailable';
  sources?: Source[];
  // Agent answers only (US-34): what the agent can read to the caller, from public passages only.
  // null when there is none (no public passage applies, or it couldn't be written).
  customerWording?: string | null;
  // True when personal details were hidden before the message reached OpenAI (R7).
  piiMasked?: boolean;
};

export type ChatMessage = UIMessage<ChatMetadata>;
