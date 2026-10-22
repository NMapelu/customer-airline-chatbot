import type { Source } from '../rag/types';

// The answer as plain text with its source links, for the clipboard (overview §7.15).
export function answerWithSources(text: string, sources: Source[]): string {
  if (sources.length === 0) return text;
  const lines = sources.map((s) => {
    const label = s.section ? `${s.title}: ${s.section}` : s.title;
    return s.url ? `- ${label} (${s.url})` : `- ${label}`;
  });
  return `${text}\n\nSources:\n${lines.join('\n')}`;
}
