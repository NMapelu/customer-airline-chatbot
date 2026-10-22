'use client';

import { useState, useTransition } from 'react';
import type { ShareSummary } from '@/lib/chat/shares';
import { revokeShareAction } from '../(chat)/actions';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Overview §7.15: the owner can turn off any shared link at any time.
export function SharedLinks({ shares }: { shares: ShareSummary[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (shares.length === 0) return <p className="text-sm">You have no shared links.</p>;
  return (
    <>
      <ul className="space-y-1 text-sm">
        {shares.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <a href={`/s/${s.id}`} className="truncate text-blue-700 underline">
              Shared {shortDate(s.createdAt)}, works until {shortDate(s.expiresAt)}
            </a>
            <button
              type="button"
              disabled={pending}
              className="text-xs text-red-700 underline"
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
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
