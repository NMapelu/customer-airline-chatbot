import { getCloudflareContext } from '@opennextjs/cloudflare';
import { z } from 'zod';

// Server-side configuration. Values never reach the browser.
// Add new variables here and to .dev.vars.example as later phases need them.
const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string({ error: 'is required' }).min(1, 'is required'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

// Secrets come from Cloudflare bindings: `wrangler secret put` in production,
// `.dev.vars` locally (wired into `next dev` by initOpenNextCloudflareForDev).
function readRawEnv(): Record<string, unknown> {
  let bindings: Record<string, unknown> = {};
  try {
    bindings = getCloudflareContext().env as unknown as Record<string, unknown>;
  } catch {
    // Not running under OpenNext (for example in unit tests): fall back to process.env only.
  }
  return { ...process.env, ...bindings };
}

// Fail-safe: a missing or invalid variable stops the request instead of running half-configured.
export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(readRawEnv());
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid server environment. Check .dev.vars (local) or wrangler secrets (deployed):\n${problems}`);
  }
  return parsed.data;
}
