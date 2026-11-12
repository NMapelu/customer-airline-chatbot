// Which company's models the app uses. Set AI_PROVIDER to 'google' to use Gemini instead of OpenAI.
// Changing it needs a re-run of `npm run ingest` with the same AI_PROVIDER, because passages
// embedded by one company's model can't be searched with another's.
export const AI_PROVIDERS = ['openai', 'google'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

// The key each provider needs, for the environment checks.
export const KEY_FOR: Record<AiProvider, 'OPENAI_API_KEY' | 'GOOGLE_GENERATIVE_AI_API_KEY'> = {
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};
