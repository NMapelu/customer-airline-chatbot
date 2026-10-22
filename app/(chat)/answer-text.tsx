'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeAnswerHref } from '@/lib/chat/links';

// Answers formatted for skimming (overview §7.8, US-24): bold, lists and small tables from the
// model's Markdown. Raw HTML in an answer is dropped, never rendered (T3), only the elements
// below are allowed, and only https links to kenya-airways.com are kept, opening in a new tab.
const ALLOWED = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'code', 'del'];

const components: Components = {
  p: ({ children }) => <p className="my-1">{children}</p>,
  ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-gray-400 bg-gray-100 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-gray-400 px-2 py-1 align-top">{children}</td>,
};

export function AnswerText({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} allowedElements={ALLOWED} unwrapDisallowed skipHtml urlTransform={safeAnswerHref} components={components}>
      {text}
    </ReactMarkdown>
  );
}
