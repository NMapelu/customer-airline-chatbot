// Reads knowledge-base documents from docs/public and docs/staff for ingestion.
// scripts/check-corpus.mjs validates the files first; this parser is just as strict, so a file
// that somehow skipped the check still can't be loaded with a missing or wrong audience.
import { createHash } from 'node:crypto';

export type Audience = 'public' | 'staff';

export type KbDocument = {
  slug: string;
  title: string;
  audience: Audience;
  illustrative: boolean;
  sourceUrl: string | null;
  retrievedAt: string | null;
  body: string;
  contentHash: string;
};

export function parseDocument(slug: string, folder: Audience, text: string): KbDocument {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${folder}/${slug}: missing front matter`);
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const pair = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!pair) throw new Error(`${folder}/${slug}: unreadable front matter line "${line}"`);
    data[pair[1]] = pair[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }

  // Fail safe: the audience must be stated and must match the folder. Never default to public.
  if (data.audience !== folder) {
    throw new Error(`${folder}/${slug}: audience is "${data.audience ?? 'missing'}", expected "${folder}"`);
  }
  if (!data.title) throw new Error(`${folder}/${slug}: missing title`);
  if (folder === 'staff' && data.illustrative !== 'true') {
    throw new Error(`${folder}/${slug}: staff procedures must be marked illustrative: true`);
  }
  if (folder === 'public' && (!data.source_url || !data.retrieved)) {
    throw new Error(`${folder}/${slug}: public pages need source_url and retrieved`);
  }

  const body = match[2].trim();
  const document = {
    slug,
    title: data.title,
    audience: folder,
    illustrative: folder === 'staff',
    sourceUrl: data.source_url || null,
    retrievedAt: data.retrieved || null,
    body,
  };
  return { ...document, contentHash: contentHash(document) };
}

// The hash covers everything that ends up in the database except the retrieval date, so a page
// fetched again with unchanged text is reported as unchanged and isn't re-embedded.
export function contentHash(doc: Pick<KbDocument, 'title' | 'audience' | 'illustrative' | 'sourceUrl' | 'body'>): string {
  const canonical = JSON.stringify([doc.title, doc.audience, doc.illustrative, doc.sourceUrl, doc.body]);
  return createHash('sha256').update(canonical).digest('hex');
}

export type Plan = {
  added: KbDocument[];
  updated: KbDocument[];
  unchanged: KbDocument[];
  removed: string[];
};

// Compares local documents with the hashes already in the database (slug -> content_hash).
export function planIngest(local: KbDocument[], remote: Map<string, string>): Plan {
  const plan: Plan = { added: [], updated: [], unchanged: [], removed: [] };
  const seen = new Set<string>();
  for (const doc of local) {
    if (seen.has(doc.slug)) throw new Error(`duplicate slug "${doc.slug}" in docs/public and docs/staff`);
    seen.add(doc.slug);
    const hash = remote.get(doc.slug);
    if (hash === undefined) plan.added.push(doc);
    else if (hash !== doc.contentHash) plan.updated.push(doc);
    else plan.unchanged.push(doc);
  }
  plan.removed = [...remote.keys()].filter((slug) => !seen.has(slug)).sort();
  return plan;
}
