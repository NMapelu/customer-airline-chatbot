// Splits a markdown document into chunks for embedding (overview §8.3).
// Sections are split on ## and ### headings first. A section longer than the target size is
// packed from paragraphs, then lines, then hard-split, with a short overlap between chunks.
// Every chunk starts with its section heading so it still makes sense on its own.

export type Chunk = {
  section: string | null;
  content: string;
};

export type ChunkOptions = {
  maxChars?: number;
  overlapChars?: number;
};

const HEADING = /^(#{2,3})\s+(.+?)\s*#*\s*$/;

type Section = { heading: string | null; body: string };

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: null, body: '' };
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const match = inFence ? null : line.match(HEADING);
    if (match) {
      sections.push(current);
      current = { heading: match[2], body: '' };
    } else {
      current.body += `${line}\n`;
    }
  }
  sections.push(current);
  return sections.filter((s) => s.body.trim() !== '');
}

// Break text into pieces no longer than max: paragraphs, then lines, then fixed-size slices.
// A markdown table is one paragraph, so it is only split between rows.
function pieces(text: string, max: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    if (paragraph.length <= max) {
      out.push(paragraph);
      continue;
    }
    for (const line of paragraph.split('\n').map((l) => l.trim()).filter(Boolean)) {
      if (line.length <= max) {
        out.push(line);
        continue;
      }
      for (let i = 0; i < line.length; i += max) out.push(line.slice(i, i + max));
    }
  }
  return out;
}

// The last ~n characters of a chunk, carried into the next chunk. Prefer whole lines; inside a
// long line start at a word boundary. Never start partway through a table row.
function tail(text: string, n: number): string {
  if (n <= 0) return '';
  if (text.length <= n) return text;
  const slice = text.slice(-n);
  const newline = slice.indexOf('\n');
  if (newline >= 0) return slice.slice(newline + 1).replace(/^\s+/, '');
  const lastLine = text.slice(text.lastIndexOf('\n') + 1);
  if (lastLine.trimStart().startsWith('|')) return '';
  const space = slice.indexOf(' ');
  return space >= 0 ? slice.slice(space + 1) : slice;
}

export function chunkMarkdown(markdown: string, options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? 800;
  const overlapChars = options.overlapChars ?? 100;
  if (overlapChars >= maxChars) throw new Error('overlapChars must be smaller than maxChars');

  const chunks: Chunk[] = [];
  for (const { heading, body } of splitSections(markdown)) {
    const prefix = heading ? `## ${heading}\n\n` : '';
    const room = Math.max(maxChars - prefix.length, overlapChars + 3);
    let buffer = '';
    let hasNew = false;
    const flush = () => {
      if (hasNew) chunks.push({ section: heading, content: prefix + buffer.trim() });
      buffer = tail(buffer, overlapChars);
      hasNew = false;
    };
    // Leave space for the overlap and the blank line that joins it to the next piece.
    for (const piece of pieces(body, room - overlapChars - 2)) {
      const joined = buffer ? `${buffer}\n\n${piece}` : piece;
      if (joined.length > room && hasNew) {
        flush();
        buffer = buffer ? `${buffer}\n\n${piece}` : piece;
      } else {
        buffer = joined;
      }
      hasNew = true;
    }
    flush();
  }
  return chunks;
}
