import { z } from 'zod';

// Server-side configuration. Values never reach the browser.
// Add new variables here and to .env.example as later phases need them.
const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string({ error: 'is required' }).min(1, 'is required'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

// Fail-safe: a missing or invalid variable stops the app instead of running half-configured.
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid server environment. Check .env.local against .env.example:\n${problems}`);
  }

  cached = parsed.data;
  return cached;
}
