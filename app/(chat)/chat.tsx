'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { SendIcon } from '@/components/icons';
import { isStale, STALE_AFTER_MONTHS } from '@/lib/rag/passages';
import type { ChatMessage, Role, Source } from '@/lib/rag/types';
import { AnswerText } from './answer-text';
import { AnswerActions } from './answer-actions';
import { Feedback } from './feedback';

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
      <summary className="cursor-pointer font-medium text-brand">Show the exact wording</summary>
      {passages.map((p, i) => (
        <blockquote key={i} className="mt-1 whitespace-pre-line border-l-2 border-ok pl-2 text-foreground">
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
    <div className="mt-3 rounded-lg border border-line bg-background/60 p-3 text-xs text-muted">
      <p className="flex items-center gap-2 font-semibold text-foreground">
        Sources <span className="badge badge-ok">{sources.length}</span>
      </p>
      <ul className="mt-2 space-y-2">
        {sources.map((s, i) => {
          const label = s.section ? `${s.title}: ${s.section}` : s.title;
          const url = safeUrl(s.url);
          return (
            <li key={i}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className="link">
                  {label}
                </a>
              ) : (
                <span className="font-medium text-foreground">{label}</span>
              )}
              {s.audience === 'staff' && <span className="badge badge-brand ml-1.5">Internal</span>}
              {s.audience === 'staff' && s.illustrative && <span className="badge badge-muted ml-1">Sample procedure</span>}
              {role === 'agent' && s.audience === 'public' && <span className="badge badge-ok ml-1.5">Public</span>}
              {s.retrievedAt && <span className="ml-1.5">checked {checkedOn(s.retrievedAt)}</span>}
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
      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
        <p className="font-semibold">Customer-ready wording</p>
        <p>None for this answer: no public information covers it. Don&apos;t read the internal steps to the caller.</p>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-lg border border-ok bg-ok-soft p-3 text-sm text-foreground">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ok">Customer-ready wording (public information only)</p>
        <CopyButton text={text} className="btn btn-ok btn-sm" />
      </div>
      <p className="mt-1">{text}</p>
    </div>
  );
}

// Overview §7.11: the passenger's question, ready to paste into the KQ contact form.
function EscalationSummary({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-lg border border-brand bg-brand-soft p-3 text-sm text-foreground">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-brand">Your question, ready to send to Kenya Airways</p>
        <CopyButton text={text} className="btn btn-danger btn-sm" />
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
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="mx-auto mt-6 max-w-xl text-center sm:mt-16">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {role === 'agent' ? 'What is the caller asking about?' : 'How can I help with your trip?'}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {role === 'agent'
                ? "Describe the caller's situation, or start with a common call. Answers use public information and internal procedures."
                : 'Ask a question about your Kenya Airways trip, such as baggage, refunds, check-in or special assistance. Every answer shows where it comes from.'}
            </p>
          </div>
        )}
        {messages.length === 0 && role === 'agent' && (
          <div className="mx-auto max-w-xl text-center text-sm">
            <div className="flex flex-wrap justify-center gap-2">
              {AGENT_QUICK_STARTS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  disabled={busy}
                  onClick={() => sendMessage({ text: q.question })}
                  className="chip"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, index) => (
          <div key={m.id} className={`mx-auto flex max-w-3xl ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#c8102e] px-4 py-2.5 text-white'
                  : 'card w-full max-w-[95%] rounded-tl-md px-4 py-3'
              }
            >
              {m.role === 'assistant' && (
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">KQ Chatbot</p>
              )}
              {/* Questions are plain text. Answers are Markdown with raw HTML dropped (threat model T3). */}
              {m.role === 'user' ? (
                m.parts.map((part, i) => (part.type === 'text' ? <span key={i}>{part.text}</span> : null))
              ) : (
                <AnswerText text={answerText(m)} />
              )}
              {m.metadata?.piiMasked && (
                <p className={`mt-2 text-xs ${m.role === 'user' ? 'text-white/90' : 'text-amber-800'}`}>
                  We hid what looked like personal details in your message before processing it.
                </p>
              )}
              {m.metadata?.sources && m.metadata.sources.length > 0 && <SourceList sources={m.metadata.sources} role={role} />}
              {role === 'agent' && m.role === 'assistant' && m.metadata?.customerWording !== undefined && (
                <CustomerWording text={m.metadata.customerWording} />
              )}
              {role === 'customer' && m.metadata?.escalationSummary && <EscalationSummary text={m.metadata.escalationSummary} />}
              {m.role === 'assistant' && !(busy && index === messages.length - 1) && (
                <AnswerActions
                  text={answerText(m)}
                  sources={m.metadata?.sources ?? []}
                  messageId={m.metadata?.messageId}
                  canShare={role === 'customer'}
                />
              )}
              {m.role === 'assistant' && m.metadata?.messageId && <Feedback messageId={m.metadata.messageId} initial={m.metadata.rating} />}
              {/* US-25: under the latest answer only; tapping one sends it as the next question. */}
              {role === 'customer' && index === messages.length - 1 && !busy && (m.metadata?.followUps?.length ?? 0) > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="mb-2 text-xs font-semibold text-muted">You could also ask</p>
                  <div className="flex flex-wrap gap-2">
                  {m.metadata!.followUps!.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendMessage({ text: q })}
                      className="chip"
                    >
                      {q}
                    </button>
                  ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && messages.at(-1)?.role === 'user' && (
          <div className="mx-auto flex max-w-3xl" role="status">
            <div className="card flex items-center gap-2 px-4 py-3 text-sm text-muted">
              <span className="flex gap-1" aria-hidden="true">
                <span className="size-1.5 animate-pulse rounded-full bg-[#c8102e]" />
                <span className="size-1.5 animate-pulse rounded-full bg-[#c8102e] [animation-delay:150ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-[#c8102e] [animation-delay:300ms]" />
              </span>
              Finding your answer…
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="notice notice-error mx-auto max-w-3xl">
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
        className="mx-auto w-full max-w-3xl px-4 pb-4"
      >
        <div className="card flex items-center gap-2 p-2 shadow-lg focus-within:ring-2 focus-within:ring-[#c8102e]">
          <input
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-foreground outline-none"
            value={input}
            maxLength={1000}
            aria-label="Your question"
            placeholder={role === 'agent' ? "Describe the caller's situation..." : 'Ask a question about your trip...'}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()} className="btn btn-primary" aria-label="Send">
            <SendIcon />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
        <p className="mt-2 px-1 text-center text-xs text-muted">
          Please don&apos;t share booking references, passport, card or medical details.{' '}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </p>
      </form>
    </div>
  );
}
