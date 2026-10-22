'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { DISCLAIMER } from '@/lib/legal';
import { isStale, STALE_AFTER_MONTHS } from '@/lib/rag/passages';
import type { ChatMessage, Role, Source } from '@/lib/rag/types';
import { AnswerText } from './answer-text';

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

const answerText = (m: ChatMessage) => m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');

const checkedOn = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Only https links are rendered as links.
const safeUrl = (url: string | null) => (url && url.startsWith('https://') ? url : null);

// US-22: the exact stored passage, with the sentences that match the question highlighted.
// Rendered as text, never as HTML.
function PassagePreview({ passages }: { passages: NonNullable<Source['passages']> }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-blue-700">Show the exact wording</summary>
      {passages.map((p, i) => (
        <blockquote key={i} className="mt-1 whitespace-pre-line border-l-2 border-gray-300 pl-2 text-gray-800">
          {p.section && <span className="block font-semibold">{p.section}</span>}
          {p.parts.map((part, j) =>
            part.highlight ? (
              <mark key={j} className="bg-yellow-200 text-black">
                {part.text}
              </mark>
            ) : (
              <span key={j}>{part.text}</span>
            ),
          )}
        </blockquote>
      ))}
    </details>
  );
}

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
              {isStale(s.retrievedAt) && (
                <p className="text-amber-800">
                  This was checked more than {STALE_AFTER_MONTHS} months ago. Please confirm on the KQ website.
                </p>
              )}
              {s.passages && s.passages.length > 0 && <PassagePreview passages={s.passages} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// A Copy button that says "Copied" once the text is on the clipboard.
function CopyButton({ text, className }: { text: string; className: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          () => setCopied(false),
        )
      }
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// US-34: what an agent can read to the caller, written from public passages only.
function CustomerWording({ text }: { text: string | null }) {
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
        <CopyButton text={text} className="rounded border border-green-400 bg-white px-2 py-0.5 text-xs" />
      </div>
      <p className="mt-1">{text}</p>
    </div>
  );
}

// Overview §7.11: the passenger's question, ready to paste into the KQ contact form.
function EscalationSummary({ text }: { text: string }) {
  return (
    <div className="mt-2 rounded border border-blue-300 bg-blue-50 p-2 text-sm text-black">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Your question, ready to send to Kenya Airways</p>
        <CopyButton text={text} className="rounded border border-blue-400 bg-white px-2 py-0.5 text-xs" />
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
        {messages.map((m, index) => (
          <div key={m.id} className={`mx-auto flex max-w-2xl ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`rounded-lg px-4 py-2 max-w-[80%] ${
                m.role === 'user' ? 'whitespace-pre-wrap bg-blue-500 text-white' : 'bg-gray-200 text-black'
              }`}
            >
              {/* Questions are plain text. Answers are Markdown with raw HTML dropped (threat model T3). */}
              {m.role === 'user' ? (
                m.parts.map((part, i) => (part.type === 'text' ? <span key={i}>{part.text}</span> : null))
              ) : (
                <AnswerText text={answerText(m)} />
              )}
              {m.metadata?.piiMasked && (
                <p className="mt-2 text-xs text-amber-800">
                  We hid what looked like personal details in your message before processing it.
                </p>
              )}
              {m.metadata?.sources && m.metadata.sources.length > 0 && <SourceList sources={m.metadata.sources} role={role} />}
              {role === 'agent' && m.role === 'assistant' && m.metadata?.customerWording !== undefined && (
                <CustomerWording text={m.metadata.customerWording} />
              )}
              {role === 'customer' && m.metadata?.escalationSummary && <EscalationSummary text={m.metadata.escalationSummary} />}
              {/* US-25: under the latest answer only; tapping one sends it as the next question. */}
              {role === 'customer' && index === messages.length - 1 && !busy && (m.metadata?.followUps?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-gray-300 pt-2">
                  {m.metadata!.followUps!.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendMessage({ text: q })}
                      className="rounded-full border border-blue-300 bg-white px-3 py-1 text-left text-sm text-blue-800 hover:bg-blue-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
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
        <p className="px-2 text-xs text-gray-500">
          {DISCLAIMER}{' '}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </p>
      </form>
    </div>
  );
}
