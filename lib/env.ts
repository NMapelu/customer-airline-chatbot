import { getCloudflareContext } from '@opennextjs/cloudflare';
import { z } from 'zod';
import { AI_PROVIDERS, KEY_FOR } from './ai/provider';
import { supabaseUrlSchema } from './supabase/url';

// An empty line in .dev.vars (KEY=) counts as not set.
const optionalKey = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

// Server-side configuration. Values never reach the browser.
// Add new variables here and to .dev.vars.example as later phases need them.
const serverEnvSchema = z
  .object({
    // Which company's models to use (lib/ai/models.ts). OpenAI unless set.
    AI_PROVIDER: z.enum(AI_PROVIDERS).default('openai'),
    // Only the chosen provider's key is required.
    OPENAI_API_KEY: optionalKey,
    GOOGLE_GENERATIVE_AI_API_KEY: optionalKey,
    GEMINI_MODEL: optionalKey,
    // The anon (publishable) key: every query runs as the signed-in user, under RLS.
    // The service-role key is never used by the web app.
    SUPABASE_URL: supabaseUrlSchema,
    SUPABASE_ANON_KEY: z.string({ error: 'is required' }).min(1, 'is required'),
  })
  .superRefine((env, ctx) => {
    const key = KEY_FOR[env.AI_PROVIDER];
    if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `is required when AI_PROVIDER is ${env.AI_PROVIDER}` });
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
