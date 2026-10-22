import type { PassagePart } from './types';

// Source passage preview (overview §7.6, US-22). The passage shown under an answer is the stored
// chunk text, split into sentences, with the sentences that best match the question marked.
// Worked out here from stored text and the question, never by the model, so it can't be altered
// by generation. Shown as plain text: the UI never renders it as HTML.

export const MAX_PASSAGE_CHARS = 3000;
const MAX_HIGHLIGHTS = 2;

const STOP_WORDS = new Set(
  (
    'a an and are as at be by can do does for from has have how i if in is it its my of on or ' +
    'our so than that the their them there these they this to was we what when where which who ' +
    'why will with you your me am any about after before into per kq kenya airways please tell'
  ).split(' '),
);

const words = (text: string) =>
  (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1 && !STOP_WORDS.has(w));

// Sentence ends: . ! ? followed by white space (so "23.5 kg" stays whole), or a line break.
// Keeps the separators, so joining the parts gives back the original text exactly.
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?]+\s+|\n+/g)) {
    const end = m.index + m[0].length;
    out.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

export function highlightPassage(content: string, query: string): PassagePart[] {
  const text = content.length > MAX_PASSAGE_CHARS ? `${content.slice(0, MAX_PASSAGE_CHARS)}…` : content;
  const sentences = splitSentences(text);
  const wanted = new Set(words(query));
  const scores = sentences.map((s) => new Set(words(s).filter((w) => wanted.has(w))).size);
  const best = scores
    .map((score, i) => ({ score, i }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_HIGHLIGHTS)
    .map((s) => s.i);
  const parts: PassagePart[] = [];
  sentences.forEach((sentence, i) => {
    const highlight = best.includes(i);
    const last = parts.at(-1);
    if (last && last.highlight === highlight) last.text += sentence;
    else parts.push({ text: sentence, highlight });
  });
  return parts;
}

// Overview §7.7, US-23: a policy checked more than 6 months ago should be confirmed with KQ.
export const STALE_AFTER_MONTHS = 6;

export function isStale(retrievedAt: string | null, now = new Date()): boolean {
  if (!retrievedAt) return false;
  const checked = new Date(`${retrievedAt.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(checked.getTime())) return false;
  const limit = new Date(now);
  limit.setUTCMonth(limit.getUTCMonth() - STALE_AFTER_MONTHS);
  return checked < limit;
}
