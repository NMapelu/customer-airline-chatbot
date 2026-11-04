'use client';

import { useState, useTransition } from 'react';
import type { ShareSummary } from '@/lib/chat/shares';
import { revokeShareAction } from '../actions';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Overview §7.15: the owner can turn off any shared link at any time.
export function SharedLinks({ shares }: { shares: ShareSummary[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (shares.length === 0) return <p className="text-sm text-muted">You have no shared links.</p>;
  return (
    <>
      <ul className="divide-y divide-line text-sm">
        {shares.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 py-2">
            <a href={`/s/${s.id}`} className="link truncate">
              Shared {shortDate(s.createdAt)}, works until {shortDate(s.expiresAt)}
            </a>
            <button
              type="button"
              disabled={pending}
              className="btn btn-danger btn-sm shrink-0"
              onClick={() =>
                startTransition(async () => {
                  const result = await revokeShareAction(s.id);
                  setError(result.ok ? null : result.error);
                })
              }
            >
              Stop sharing
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-brand">
          {error}
        </p>
      )}
    </>
  );
}
