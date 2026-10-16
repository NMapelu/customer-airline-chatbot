'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import type { ChatMessage, Source } from '@/lib/rag/types';

// The server answers errors with {"error": "..."}; show that text, or a generic message.
function errorText(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return 'Sorry, something went wrong. Please try again.';
}

const checkedOn = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Only https links are rendered as links.
const safeUrl = (url: string | null) => (url && url.startsWith('https://') ? url : null);

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <div className="mt-2 border-t border-gray-300 pt-2 text-xs text-gray-700">
      <p className="font-semibold">Sources</p>
      <ul className="mt-1 space-y-1">
        {sources.map((s, i) => {
          const label = s.section ? `${s.title}: ${s.section}` : s.title;
          const url = safeUrl(s.url);
          return (
            <li key={i}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                  {label}
                </a>
              ) : (
                <span>{label}</span>
              )}
              {s.audience === 'staff' && <span className="ml-1 font-semibold">(Internal)</span>}
              {s.retrievedAt && <span className="ml-1 text-gray-500">checked {checkedOn(s.retrievedAt)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Chat() {
  const { messages, sendMessage, status, error } = useChat<ChatMessage>();
  const [input, setInput] = useState('');
  const busy = status === 'submitted' || status === 'streaming';

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <div className="space-y-4 mb-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`rounded-lg px-4 py-2 max-w-[80%] whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'
              }`}
            >
              {/* Plain text only: answers are never rendered as HTML (threat model T3). */}
              {m.parts.map((part, i) => (part.type === 'text' ? <span key={i}>{part.text}</span> : null))}
              {m.metadata?.piiMasked && (
                <p className="mt-2 text-xs text-amber-800">
                  We hid what looked like personal details in your message before processing it.
                </p>
              )}
              {m.metadata?.sources && m.metadata.sources.length > 0 && <SourceList sources={m.metadata.sources} />}
            </div>
          </div>
        ))}
        {error && (
          <div role="alert" className="rounded-lg px-4 py-2 bg-red-100 text-red-800">
            {errorText(error)}
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          sendMessage({ text: input });
          setInput('');
        }}
        className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl bg-white"
      >
        <input
          className="w-full p-2"
          value={input}
          maxLength={1000}
          placeholder="Ask about a Kenya Airways policy..."
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <p className="px-2 text-xs text-gray-500">
          Please don&apos;t share booking references, passport, card or medical details.
        </p>
      </form>
    </div>
  );
}
