// The service-role client for the admin scripts (invite-agent, deactivate-agent, set-admin). It reads
// .env.ingest, the one file that may hold the service-role key: never .env.local, .dev.vars or
// Cloudflare, because the web app must never have it (overview §10.3, §10.7).
import { existsSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabaseUrlSchema } from '../lib/supabase/url';

export function fail(message: string): never {
  console.error(`\nStopped: ${message}`);
  process.exit(1);
}

// The address people open the app at, like https://kq-policy-assistant.<you>.workers.dev.
// http is allowed only for a local site.
const siteSchema = z.url({ error: 'must be the address of the app, like https://<name>.workers.dev' }).refine((value) => {
  const url = new URL(value);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return url.protocol === 'https:' || (local && url.protocol === 'http:');
}, 'must start with https://');

export function adminClient(needSite: boolean): { admin: SupabaseClient; site: string } {
  if (!existsSync('.env.ingest')) fail('.env.ingest not found. Copy .env.ingest.example to .env.ingest and fill it in.');
  process.loadEnvFile('.env.ingest');
  const parsed = z
    .object({
      SUPABASE_URL: supabaseUrlSchema,
      SUPABASE_SERVICE_ROLE_KEY: z.string({ error: 'is required' }).min(1, 'is required'),
      SITE_URL: needSite ? siteSchema : z.string().optional(),
    })
    .safeParse(process.env);
  if (!parsed.success) fail(`check .env.ingest: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}`);
  const admin = createClient(parsed.data.SUPABASE_URL, parsed.data.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { admin, site: parsed.data.SITE_URL ?? '' };
}

export function emailArgument(usage: string): string {
  const email = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const parsed = z.email().safeParse(email?.trim());
  if (!parsed.success) fail(`give the account's email address. Usage: ${usage}`);
  return parsed.data;
}
