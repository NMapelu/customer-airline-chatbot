'use client';

import { useState } from 'react';
import { answerWithSources } from '@/lib/chat/copy';
import type { Source } from '@/lib/rag/types';
import { revokeShareAction, shareAnswerAction } from './actions';

async function copy(text: string, done: (ok: boolean) => void) {
  try {
    await navigator.clipboard.writeText(text);
    done(true);
  } catch {
    done(false);
  }
}

const button = 'rounded border border-gray-400 bg-surface px-2 py-0.5 text-xs text-black hover:bg-gray-100 disabled:opacity-50';

// Copy an answer, and for passengers, share it as a read-only link that expires in 30 days.
export function AnswerActions({ text, sources, messageId, canShare }: { text: string; sources: Source[]; messageId?: string; canShare: boolean }) {
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    if (!messageId) return;
    setPending(true);
    setError(null);
    const result = await shareAnswerAction(messageId);
    setPending(false);
    if (result.ok) setLink({ id: result.id, url: `${window.location.origin}/s/${result.id}` });
    else setError(result.error);
  }

  async function revoke() {
    if (!link) return;
    setPending(true);
    const result = await revokeShareAction(link.id);
    setPending(false);
    if (result.ok) setRevoked(true);
    else setError(result.error);
  }

  return (
    <div className="mt-2 text-xs">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => copy(answerWithSources(text, sources), setCopied)}>
          {copied ? 'Copied' : 'Copy answer'}
        </button>
        {canShare && messageId && !link && (
          <button type="button" className={button} disabled={pending} onClick={share}>
            Share
          </button>
        )}
      </div>
      {link && !revoked && (
        <div className="mt-2 rounded border border-gray-300 bg-surface p-2 text-black">
          <p>Anyone with this link can read this question and answer for 30 days. It doesn&apos;t show who you are.</p>
          <input readOnly value={link.url} aria-label="Share link" className="mt-1 w-full rounded border border-gray-300 px-1 py-0.5" />
          <div className="mt-1 flex gap-2">
            <button type="button" className={button} onClick={() => copy(link.url, setLinkCopied)}>
              {linkCopied ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" className={button} disabled={pending} onClick={revoke}>
              Stop sharing
            </button>
          </div>
        </div>
      )}
      {revoked && <p className="mt-1 text-gray-600">The link no longer works.</p>}
      {error && (
        <p role="alert" className="mt-1 text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
