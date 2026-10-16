// Retrieval settings (overview §8.3). The threshold is a placeholder until Phase 7 calibrates it
// on the evaluation set.
export const CHAT_MODEL = 'gpt-4o-mini';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const TOP_K = 5;
export const SIMILARITY_THRESHOLD = 0.4;

// Abuse and cost limits (overview §10.8).
export const MAX_QUESTION_CHARS = 1000;
export const HISTORY_TURNS = 3;
