'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ConversationSummary } from '@/lib/chat/history';
import { TITLE_MAX } from '@/lib/chat/history';
import { deleteConversationAction, renameConversationAction, searchConversationsAction } from './actions';

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Newest first, with title and date (US-10). Rename and delete act on one conversation (US-12).
// The search box finds conversations by words in their messages (overview §7.15).
export function ConversationList({ conversations }: { conversations: ConversationSummary[] }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const search = () =>
    startTransition(async () => {
      const result = await searchConversationsAction(query);
      if (result.ok) {
        setResults(result.conversations);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  const clear = () => {
    setQuery('');
    setResults(null);
    setError(null);
  };
  const shown = results ?? conversations;

  return (
    <div className="space-y-2">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        className="flex gap-1"
      >
        <input
          type="search"
          className="min-w-0 flex-1 rounded border border-gray-300 bg-surface px-2 py-1 text-sm"
          value={query}
          maxLength={100}
          aria-label="Search your conversations"
          placeholder="Search conversations"
          onChange={(e) => (e.target.value ? setQuery(e.target.value) : clear())}
        />
        <button type="submit" disabled={pending} className="text-xs text-blue-700 underline">
          Search
        </button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      {results && (
        <p className="text-xs text-gray-600">
          {results.length === 0 ? 'No conversations match.' : `${results.length} found.`}{' '}
          <button type="button" onClick={clear} className="underline">
            Show all
          </button>
        </p>
      )}
      {!results && conversations.length === 0 ? (
        <p className="text-sm text-gray-500">No conversations yet.</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((c) => (
            <ConversationItem key={c.id} conversation={c} />
          ))}
        </ul>
      )}
    </div>
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
            className="min-w-0 flex-1 rounded border border-gray-300 bg-surface px-1"
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
