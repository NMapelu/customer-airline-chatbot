'use client';

import { useState } from 'react';
import { FEEDBACK_REASONS, type FeedbackReason } from '@/lib/chat/feedback';
import type { Rating } from '@/lib/rag/types';
import { giveFeedbackAction } from './feedback-actions';

// Overview §7.12: thumbs up or down on each answer, with optional reasons for a thumbs-down.
// One rating per answer; it can't be changed afterwards.
export function Feedback({ messageId, initial }: { messageId: string; initial?: Rating }) {
  const [rating, setRating] = useState<Rating | undefined>(initial);
  const [choosing, setChoosing] = useState(false);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(value: Rating, why: FeedbackReason | null) {
    setPending(true);
    setError(null);
    const result = await giveFeedbackAction(messageId, value, why);
    setPending(false);
    if (result.ok) {
      setRating(value);
      setChoosing(false);
    } else {
      setError(result.error);
    }
  }

  if (rating) {
    return (
      <p className="mt-2 text-xs text-ok">{rating === 'up' ? '✓ You found this helpful.' : '✓ Thanks, we will use this to improve.'}</p>
    );
  }

  const button = 'btn btn-outline btn-sm';
  return (
    <div className="mt-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted">Was this helpful?</span>
        <button type="button" className={button} disabled={pending} aria-label="Helpful" onClick={() => send('up', null)}>
          👍
        </button>
        <button
          type="button"
          className={button}
          disabled={pending}
          aria-label="Not helpful"
          aria-expanded={choosing}
          onClick={() => setChoosing(true)}
        >
          👎
        </button>
      </div>
      {choosing && (
        <fieldset className="mt-2 rounded-lg border border-line bg-surface p-3 text-foreground">
          <legend className="px-1 text-muted">What went wrong? (optional)</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FEEDBACK_REASONS) as FeedbackReason[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={reason === key}
                onClick={() => setReason(reason === key ? null : key)}
                className="chip text-xs"
              >
                {FEEDBACK_REASONS[key]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => send('down', reason)}>
              Send
            </button>
            <button type="button" className="btn btn-ok btn-sm" disabled={pending} onClick={() => setChoosing(false)}>
              Cancel
            </button>
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="mt-1 text-brand">
          {error}
        </p>
      )}
    </div>
  );
}
