// Loads the knowledge base into Supabase (overview §9.2).
//
//   npm run ingest              fetch KQ pages, check everything, embed what changed, load it
//   (set AI_PROVIDER in .env.ingest to the same value as the app's)
//   npm run ingest -- --dry-run fetch and check, then print the plan without embedding or writing
//   npm run ingest -- --skip-fetch   use the pages already in docs/public/
//
// Secrets come from .env.ingest (gitignored), never from .env.local: the Cloudflare build bundles
// .env* files into the Worker, and the service-role key must never reach the web app.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { embedMany } from 'ai';
import { z } from 'zod';
import { createModels, MODEL_NAMES } from '../lib/ai/models';
import { AI_PROVIDERS, KEY_FOR, type AiProvider } from '../lib/ai/provider';
import { chunkMarkdown } from '../lib/rag/chunk';
import { type Audience, type KbDocument, parseDocument, planIngest } from '../lib/rag/documents';
import { supabaseUrlSchema } from '../lib/supabase/url';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipFetch = args.has('--skip-fetch');

function fail(message: string): never {
  console.error(`\nIngest stopped: ${message}`);
  process.exit(1);
}

// Runs a helper script with the same Node binary, so no shell is needed on any platform.
function run(script: string, scriptArgs: string[], what: string) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], { stdio: 'inherit' });
  if (result.status !== 0) fail(`${what} failed, so nothing was loaded.`);
}

// An empty line in .env.ingest (KEY=) counts as not set.
const optionalKey = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

// The hash stored for a document also records which embedding model made its chunks, so switching
// AI_PROVIDER re-embeds every document instead of leaving passages the new model can't search.
// OpenAI keeps the plain content hash, so documents loaded before this change count as unchanged.
function storedHash(contentHash: string, provider: AiProvider): string {
  if (provider === 'openai') return contentHash;
  return createHash('sha256').update(`${contentHash}|${MODEL_NAMES[provider].embedding}`).digest('hex');
}

function loadEnv() {
  if (existsSync('.env.ingest')) {
    process.loadEnvFile('.env.ingest');
  } else {
    const hint = existsSync('.env.ingest.txt') ? ' Notepad saved it as .env.ingest.txt: rename it to .env.ingest.' : '';
    fail(`.env.ingest not found. Copy .env.ingest.example to .env.ingest and fill it in.${hint}`);
  }
  const schema = z.object({
    SUPABASE_URL: supabaseUrlSchema,
    SUPABASE_SERVICE_ROLE_KEY: z.string({ error: 'is required' }).min(1, 'is required'),
    // Must match the app's AI_PROVIDER: questions are only comparable with passages embedded by the same model.
    AI_PROVIDER: z.enum(AI_PROVIDERS).default('openai'),
    OPENAI_API_KEY: optionalKey,
    GOOGLE_GENERATIVE_AI_API_KEY: optionalKey,
  }).superRefine((env, ctx) => {
    const key = KEY_FOR[env.AI_PROVIDER];
    if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `is required when AI_PROVIDER is ${env.AI_PROVIDER}` });
  });
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ');
    fail(`check .env.ingest: ${problems}`);
  }
  return parsed.data;
}

function readDocuments(): KbDocument[] {
  const docs: KbDocument[] = [];
  for (const folder of ['public', 'staff'] as Audience[]) {
    const dir = join('docs', folder);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      docs.push(parseDocument(file.replace(/\.md$/, ''), folder, readFileSync(join(dir, file), 'utf8')));
    }
  }
  return docs;
}

async function main() {
  // 1. Fetch KQ's pages. A failed fetch stops everything: loading a partial set would delete
  //    the missing pages from the database.
  if (!skipFetch) run('scripts/fetch-corpus.mjs', ['docs/public'], 'Fetching the KQ pages');

  // 2. Check every document. A missing or wrong audience stops the load (fail-safe).
  run('scripts/check-corpus.mjs', ['--require-public'], 'The knowledge-base check');
  const docs = readDocuments();

  if (dryRun) {
    const chunkCount = docs.reduce((n, d) => n + chunkMarkdown(d.body).length, 0);
    console.log(`\nDry run: ${docs.length} documents, ${chunkCount} chunks. Nothing was embedded or written.`);
    return;
  }

  const env = loadEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const embeddingModel = createModels(env).embedding('document');
  const stamped = docs.map((d) => ({ ...d, contentHash: storedHash(d.contentHash, env.AI_PROVIDER) }));
  console.log(`Embedding with ${MODEL_NAMES[env.AI_PROVIDER].embedding} (AI_PROVIDER=${env.AI_PROVIDER}).`);

  // 3. Compare with what is already loaded.
  const { data: existing, error: readError } = await supabase.from('documents').select('slug, content_hash');
  if (readError) fail(`could not read the documents table: ${readError.message}`);
  const plan = planIngest(stamped, new Map(existing.map((row) => [row.slug as string, row.content_hash as string])));

  // 4. Embed and load each new or changed document in one transaction per document.
  for (const doc of [...plan.added, ...plan.updated]) {
    const chunks = chunkMarkdown(doc.body);
    if (chunks.length === 0) fail(`${doc.audience}/${doc.slug} has no text to load.`);
    // The title and section go into the embedded text so a chunk can be found by topic.
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: chunks.map((c) => `${doc.title}\n${c.content}`),
    });
    const { error } = await supabase.rpc('replace_document_chunks', {
      p_slug: doc.slug,
      p_title: doc.title,
      p_audience: doc.audience,
      p_illustrative: doc.illustrative,
      p_source_url: doc.sourceUrl,
      p_retrieved_at: doc.retrievedAt,
      p_content_hash: doc.contentHash,
      p_chunks: chunks.map((c, i) => ({ section: c.section, content: c.content, embedding: embeddings[i] })),
    });
    if (error) fail(`could not load ${doc.audience}/${doc.slug}: ${error.message}`);
    console.log(`loaded   ${doc.audience}/${doc.slug} (${chunks.length} chunks)`);
  }

  // 5. Remove documents that are no longer in the corpus. Their chunks go with them (cascade).
  if (plan.removed.length > 0) {
    const { error } = await supabase.from('documents').delete().in('slug', plan.removed);
    if (error) fail(`could not remove old documents: ${error.message}`);
  }

  console.log(
    `\nDone: ${plan.added.length} added, ${plan.updated.length} updated, ` +
      `${plan.unchanged.length} unchanged, ${plan.removed.length} removed` +
      (plan.removed.length ? ` (${plan.removed.join(', ')})` : '') +
      '.',
  );
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
