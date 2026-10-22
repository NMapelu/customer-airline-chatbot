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
    return <p className="mt-2 text-xs text-gray-600">{rating === 'up' ? 'You found this helpful.' : 'Thanks, we will use this to improve.'}</p>;
  }

  const button = 'rounded border border-gray-400 bg-surface px-2 py-0.5 text-xs text-black hover:bg-gray-100 disabled:opacity-50';
  return (
    <div className="mt-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-gray-600">Was this helpful?</span>
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
        <fieldset className="mt-2 rounded border border-gray-300 bg-surface p-2 text-black">
          <legend className="px-1 text-gray-600">What went wrong? (optional)</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FEEDBACK_REASONS) as FeedbackReason[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={reason === key}
                onClick={() => setReason(reason === key ? null : key)}
                className={`rounded-full border px-2 py-0.5 ${reason === key ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-surface'}`}
              >
                {FEEDBACK_REASONS[key]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" className={button} disabled={pending} onClick={() => send('down', reason)}>
              Send
            </button>
            <button type="button" className={button} disabled={pending} onClick={() => setChoosing(false)}>
              Cancel
            </button>
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="mt-1 text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
