'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { SearchIcon } from '@/components/icons';
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
          className="sidebar-input flex-1"
          value={query}
          maxLength={100}
          aria-label="Search your conversations"
          placeholder="Search conversations"
          onChange={(e) => (e.target.value ? setQuery(e.target.value) : clear())}
        />
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm px-2" aria-label="Search">
          <SearchIcon />
        </button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-[#ff7385]">
          {error}
        </p>
      )}
      {results && (
        <p className="px-1 text-xs text-zinc-400">
          {results.length === 0 ? 'No conversations match.' : `${results.length} found.`}{' '}
          <button type="button" onClick={clear} className="text-white underline">
            Show all
          </button>
        </p>
      )}
      {!results && conversations.length === 0 ? (
        <p className="px-1 text-sm text-zinc-500">No conversations yet. Your questions will appear here.</p>
      ) : (
        <ul className="space-y-0.5">
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
    <li className={`group rounded-lg px-2 py-1.5 text-sm ${current ? 'bg-[#1f1f24] ring-1 ring-[#c8102e]' : 'hover:bg-[#1f1f24]'}`}>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            rename();
          }}
          className="flex gap-1"
        >
          <input
            className="sidebar-input flex-1"
            value={title}
            maxLength={TITLE_MAX}
            aria-label="Conversation title"
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={pending} className="text-xs font-semibold text-white underline">
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setTitle(conversation.title);
              setError(null);
            }}
            className="text-xs text-zinc-400 underline"
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <Link href={href} className="block" aria-current={current ? 'page' : undefined}>
            <span className={`block truncate ${current ? 'text-white' : 'text-zinc-200'}`}>{conversation.title}</span>
          </Link>
          {/* The date shares a row with Rename and Delete, so long titles keep the full width. The buttons show on hover or
              keyboard focus, so the list stays calm; they are always shown on touch screens. */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">{shortDate(conversation.updatedAt)}</span>
            <span className="flex gap-2 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
              <button type="button" onClick={() => setEditing(true)} disabled={pending} className="text-xs text-zinc-400 hover:text-white">
                Rename
              </button>
              <button type="button" onClick={remove} disabled={pending} className="text-xs text-[#ff7385] hover:text-white">
                Delete
              </button>
            </span>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-[#ff7385]">
          {error}
        </p>
      )}
    </li>
  );
}
