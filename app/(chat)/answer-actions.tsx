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

const button = 'btn btn-outline btn-sm';

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
    <div className="mt-3 text-xs">
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
        <div className="mt-2 rounded-lg border border-ok bg-ok-soft p-3 text-foreground">
          <p>Anyone with this link can read this question and answer for 30 days. It doesn&apos;t show who you are.</p>
          <input readOnly value={link.url} aria-label="Share link" className="input mt-2 py-1 text-xs" />
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => copy(link.url, setLinkCopied)}>
              {linkCopied ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={revoke}>
              Stop sharing
            </button>
          </div>
        </div>
      )}
      {revoked && <p className="mt-1 text-muted">The link no longer works.</p>}
      {error && (
        <p role="alert" className="mt-1 text-brand">
          {error}
        </p>
      )}
    </div>
  );
}
