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

// What the browser gets under each answer (R4). Built from stored chunks, never from the model.
export type Source = {
  title: string;
  section: string | null;
  url: string | null;
  retrievedAt: string | null;
  audience: 'public' | 'staff';
};

export type ChatMetadata = {
  kind?: 'answer' | 'refusal' | 'escalation';
  sources?: Source[];
  // True when personal details were hidden before the message reached OpenAI (R7).
  piiMasked?: boolean;
};

export type ChatMessage = UIMessage<ChatMetadata>;
