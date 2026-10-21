'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ConversationSummary } from '@/lib/chat/history';
import { TITLE_MAX } from '@/lib/chat/history';
import { deleteConversationAction, renameConversationAction } from './actions';

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Newest first, with title and date (US-10). Rename and delete act on one conversation (US-12).
export function ConversationList({ conversations }: { conversations: ConversationSummary[] }) {
  if (conversations.length === 0) return <p className="text-sm text-gray-500">No conversations yet.</p>;
  return (
    <ul className="space-y-1">
      {conversations.map((c) => (
        <ConversationItem key={c.id} conversation={c} />
      ))}
    </ul>
  );
}

function ConversationItem({ conversation }: { conversation: ConversationSummary }) {
  const href = `/c/${conversation.id}`;
  const current = usePathname() === href;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rename = () =>
    startTransition(async () => {
      const result = await renameConversationAction(conversation.id, title);
      if (result.ok) setEditing(false);
      else setError(result.error);
    });

  const remove = () => {
    if (!window.confirm(`Delete "${conversation.title}"? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await deleteConversationAction(conversation.id);
      if (!result.ok) setError(result.error);
      else if (current) router.push('/');
    });
  };

  return (
    <li className={`rounded px-2 py-1 text-sm ${current ? 'bg-blue-100' : ''}`}>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            rename();
          }}
          className="flex gap-1"
        >
          <input
            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-1"
            value={title}
            maxLength={TITLE_MAX}
            aria-label="Conversation title"
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={pending} className="text-xs text-blue-700 underline">
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setTitle(conversation.title);
              setError(null);
            }}
            className="text-xs text-gray-600 underline"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-start gap-1">
          <Link href={href} className="min-w-0 flex-1" aria-current={current ? 'page' : undefined}>
            <span className="block truncate">{conversation.title}</span>
            <span className="block text-xs text-gray-500">{shortDate(conversation.updatedAt)}</span>
          </Link>
          <button type="button" onClick={() => setEditing(true)} disabled={pending} className="text-xs text-gray-600 underline">
            Rename
          </button>
          <button type="button" onClick={remove} disabled={pending} className="text-xs text-red-700 underline">
            Delete
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}
