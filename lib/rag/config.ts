// Retrieval settings (overview §8.3), calibrated on the evaluation set in Phase 7 (eval/report.md).
// The threshold only drops clearly unrelated passages: uncovered questions scored as high as
// 0.65, so similarity can't separate them alone and the coverage check (lib/rag/coverage.ts)
// makes the final call. 0.38 sits just under the lowest covered question on the second run
// (0.397). TOP_K went from 5 to 8 because facts the corpus does have (the 158 cm bag size) were
// missing from answers built on five passages.
// These were measured with OpenAI's models; Gemini's similarities differ, so rerun `npm run eval`
// after switching AI_PROVIDER. The models themselves are chosen in lib/ai/models.ts.
export const TOP_K = 8;
export const SIMILARITY_THRESHOLD = 0.38;

// Abuse and cost limits (overview §10.8).
export const MAX_QUESTION_CHARS = 1000;
export const HISTORY_TURNS = 3;
