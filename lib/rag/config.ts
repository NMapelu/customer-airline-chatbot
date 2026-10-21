// Retrieval settings (overview §8.3), calibrated on the evaluation set in Phase 7 (eval/report.md).
// The threshold only drops clearly unrelated passages: on the first run, uncovered questions
// scored as high as 0.65, so similarity can't separate them alone and the coverage check
// (lib/rag/coverage.ts) makes the final call. TOP_K went from 5 to 8 because facts the corpus
// does have (the 158 cm bag size) were missing from answers built on five passages.
export const CHAT_MODEL = 'gpt-4o-mini';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const TOP_K = 8;
export const SIMILARITY_THRESHOLD = 0.45;

// Abuse and cost limits (overview §10.8).
export const MAX_QUESTION_CHARS = 1000;
export const HISTORY_TURNS = 3;
