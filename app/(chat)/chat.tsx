'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { ChatMessage, Role, Source } from '@/lib/rag/types';

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

function SourceList({ sources, role }: { sources: Source[]; role: Role }) {
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
              {s.audience === 'staff' && s.illustrative && <span className="ml-1 italic">Sample procedure</span>}
              {role === 'agent' && s.audience === 'public' && <span className="ml-1 font-semibold">(Public)</span>}
              {s.retrievedAt && <span className="ml-1 text-gray-500">checked {checkedOn(s.retrievedAt)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// US-34: what an agent can read to the caller, written from public passages only.
function CustomerWording({ text }: { text: string | null }) {
  const [copied, setCopied] = useState(false);
  if (text === null) {
    return (
      <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
        <p className="font-semibold">Customer-ready wording</p>
        <p>None for this answer: no public policy covers it. Don&apos;t read the internal steps to the caller.</p>
      </div>
    );
  }
  return (
    <div className="mt-2 rounded border border-green-300 bg-green-50 p-2 text-sm text-black">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Customer-ready wording (public policy only)</p>
        <button
          type="button"
          className="rounded border border-green-400 bg-white px-2 py-0.5 text-xs"
          onClick={() =>
            navigator.clipboard.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-1">{text}</p>
    </div>
  );
}

// Overview §7.14: common call types, one click away.
const AGENT_QUICK_STARTS = [
  { label: 'Refund request', question: 'A caller wants a refund for their ticket. How do I handle it?' },
  { label: 'Missed connection', question: 'A caller missed their connection because their first KQ flight was late. What do I do?' },
  { label: 'Lost bag', question: 'A caller says their checked bag did not arrive. How do I take the report?' },
  { label: 'Wheelchair request', question: 'A caller needs wheelchair assistance for their flight. How do I arrange it?' },
  { label: 'Mileage claim', question: 'A caller says Asante Rewards miles are missing from a past flight. How do I handle the claim?' },
];

// Only the conversation id and the new question go to the server; it keeps the history itself.
const transport = new DefaultChatTransport<ChatMessage>({
  api: '/api/chat',
  prepareSendMessagesRequest: ({ id, messages }) => {
    const last = messages.at(-1);
    const text = last?.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') ?? '';
    return { body: { id, text } };
  },
});

// One conversation. `id` is its address (/c/<id>); the server creates it on the first question.
export function Chat({ id, role, initialMessages }: { id: string; role: Role; initialMessages: ChatMessage[] }) {
  const router = useRouter();
  const { messages, sendMessage, status, error } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    transport,
    // Refresh the history sidebar so a new conversation, or a changed order, shows up.
    onFinish: () => router.refresh(),
  });
  const [input, setInput] = useState('');
  const busy = status === 'submitted' || status === 'streaming';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {messages.length === 0 && role === 'customer' && (
          <p className="mx-auto max-w-md text-center text-sm text-gray-500">
            Ask about a Kenya Airways policy, such as baggage, refunds, check-in or special assistance.
          </p>
        )}
        {messages.length === 0 && role === 'agent' && (
          <div className="mx-auto max-w-md text-center text-sm text-gray-600">
            <p>Describe the caller&apos;s situation, or start with a common call:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {AGENT_QUICK_STARTS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  disabled={busy}
                  onClick={() => sendMessage({ text: q.question })}
                  className="rounded-full border border-gray-300 bg-white px-3 py-1 text-black hover:bg-gray-100"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`mx-auto flex max-w-2xl ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
              {m.metadata?.sources && m.metadata.sources.length > 0 && <SourceList sources={m.metadata.sources} role={role} />}
              {role === 'agent' && m.role === 'assistant' && m.metadata?.customerWording !== undefined && (
                <CustomerWording text={m.metadata.customerWording} />
              )}
            </div>
          </div>
        ))}
        {error && (
          <div role="alert" className="mx-auto max-w-2xl rounded-lg px-4 py-2 bg-red-100 text-red-800">
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
        className="mx-auto mb-4 w-full max-w-2xl rounded border border-gray-300 bg-white p-2 shadow-xl"
      >
        <input
          className="w-full p-2 text-black"
          value={input}
          maxLength={1000}
          aria-label="Your question"
          placeholder={role === 'agent' ? "Describe the caller's situation..." : 'Ask about a Kenya Airways policy...'}
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
