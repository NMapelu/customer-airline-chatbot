// Checks every knowledge-base document before it can be ingested.
// The audience in a document's front matter decides who may read it (see the RLS in
// supabase/migrations), so a missing or wrong audience must stop the build, never default to public.
//
// docs/staff/ holds our own sample procedures and is committed. docs/public/ holds KQ's pages,
// which are fetched at ingest time and never committed, so CI only checks it when files exist.
// Ingestion runs this with --require-public so it can never load an empty public corpus.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const AUDIENCES = ['public', 'staff'];
const ALLOWED_KEYS = {
  public: ['title', 'audience', 'source_url', 'retrieved'],
  staff: ['title', 'audience', 'illustrative', 'based_on'],
};
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const KQ_URL = /^https:\/\/(?:[a-z0-9-]+\.)*kenya-airways\.com\//;

function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const data = {};
  const problems = [];
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const pair = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!pair) {
      problems.push(`unreadable front matter line: "${line}"`);
      continue;
    }
    const [, key, raw] = pair;
    if (key in data) problems.push(`duplicate key "${key}"`);
    data[key] = raw.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { data, body: match[2], problems };
}

function isPastDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) && date <= new Date();
}

function checkDocument(folder, file) {
  const problems = [];
  // nosemgrep -- linear pattern, run on repo file names only.
  if (!SLUG.test(file)) problems.push('file name must be lowercase-with-hyphens.md');

  const parsed = parseFrontMatter(readFileSync(join('docs', folder, file), 'utf8'));
  if (!parsed) return ['missing front matter (the file must start with a --- block)'];
  const { data, body } = parsed;
  problems.push(...parsed.problems);

  for (const key of Object.keys(data)) {
    if (!ALLOWED_KEYS[folder].includes(key)) problems.push(`unexpected key "${key}"`);
  }
  for (const key of ALLOWED_KEYS[folder]) {
    if (!data[key]) problems.push(`missing "${key}"`);
  }
  if (data.audience && data.audience !== folder) {
    problems.push(`audience is "${data.audience}" but the file is in docs/${folder}/`);
  }

  if (folder === 'public') {
    // nosemgrep -- linear pattern, run on the repo's own front matter only.
    if (data.source_url && !KQ_URL.test(data.source_url)) {
      problems.push('source_url must be an https://…kenya-airways.com/ address');
    }
    if (data.retrieved && !isPastDate(data.retrieved)) {
      problems.push('retrieved must be a real date in YYYY-MM-DD form, not in the future');
    }
  } else if (data.illustrative && data.illustrative !== 'true') {
    problems.push('illustrative must be true: staff procedures are samples, not real KQ documents');
  }

  if (!/^## \S/m.test(body)) problems.push('body needs at least one "## " section heading');
  return problems;
}

const failures = [];
const requirePublic = process.argv.includes('--require-public');
const counts = { public: 0, staff: 0 };
for (const folder of AUDIENCES) {
  const dir = join('docs', folder);
  if (!existsSync(dir)) {
    failures.push(`docs/${folder}/ is missing`);
    continue;
  }
  for (const file of readdirSync(dir).sort()) {
    if (file === '.gitkeep') continue;
    counts[folder] += 1;
    for (const problem of checkDocument(folder, file)) failures.push(`docs/${folder}/${file}: ${problem}`);
  }
}
if (counts.staff === 0) failures.push('no staff procedures found in docs/staff/');
if (requirePublic && counts.public === 0) failures.push('no public pages found in docs/public/ (run the fetch step first)');

if (failures.length > 0) {
  console.error('Knowledge-base check failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Knowledge-base check passed: ${counts.public} public pages, ${counts.staff} staff procedures.`);
