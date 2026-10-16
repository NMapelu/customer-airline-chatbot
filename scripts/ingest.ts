// Loads the knowledge base into Supabase (overview §9.2).
//
//   npm run ingest              fetch KQ pages, check everything, embed what changed, load it
//   npm run ingest -- --dry-run fetch and check, then print the plan without embedding or writing
//   npm run ingest -- --skip-fetch   use the pages already in docs/public/
//
// Secrets come from .env.ingest (gitignored), never from .env.local: the Cloudflare build bundles
// .env* files into the Worker, and the service-role key must never reach the web app.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';
import { embedMany } from 'ai';
import { z } from 'zod';
import { chunkMarkdown } from '../lib/rag/chunk';
import { type Audience, type KbDocument, parseDocument, planIngest } from '../lib/rag/documents';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipFetch = args.has('--skip-fetch');

function fail(message: string): never {
  console.error(`\nIngest stopped: ${message}`);
  process.exit(1);
}

function run(command: string, commandArgs: string[], what: string) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) fail(`${what} failed, so nothing was loaded.`);
}

function loadEnv() {
  if (existsSync('.env.ingest')) process.loadEnvFile('.env.ingest');
  const schema = z.object({
    SUPABASE_URL: z.url({ error: 'must be your project URL, like https://<ref>.supabase.co' }),
    SUPABASE_SERVICE_ROLE_KEY: z.string({ error: 'is required' }).min(1, 'is required'),
    OPENAI_API_KEY: z.string({ error: 'is required' }).min(1, 'is required'),
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
  if (!skipFetch) run('node', ['scripts/fetch-corpus.mjs', 'docs/public'], 'Fetching the KQ pages');

  // 2. Check every document. A missing or wrong audience stops the load (fail-safe).
  run('node', ['scripts/check-corpus.mjs', '--require-public'], 'The knowledge-base check');
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
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  // 3. Compare with what is already loaded.
  const { data: existing, error: readError } = await supabase.from('documents').select('slug, content_hash');
  if (readError) fail(`could not read the documents table: ${readError.message}`);
  const plan = planIngest(docs, new Map(existing.map((row) => [row.slug as string, row.content_hash as string])));

  // 4. Embed and load each new or changed document in one transaction per document.
  for (const doc of [...plan.added, ...plan.updated]) {
    const chunks = chunkMarkdown(doc.body);
    if (chunks.length === 0) fail(`${doc.audience}/${doc.slug} has no text to load.`);
    // The title and section go into the embedded text so a chunk can be found by topic.
    const { embeddings } = await embedMany({
      model: openai.embedding(EMBEDDING_MODEL),
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
