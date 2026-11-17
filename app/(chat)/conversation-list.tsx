'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArchiveIcon, PinIcon, SearchIcon } from '@/components/icons';
import type { ConversationSummary } from '@/lib/chat/history';
import { TITLE_MAX } from '@/lib/chat/history';
import {
  archiveConversationAction,
  deleteConversationAction,
  listArchivedAction,
  pinConversationAction,
  renameConversationAction,
  revokeShareAction,
  searchConversationsAction,
  shareConversationAction,
} from './actions';
import { ConversationMenu, type MenuAction } from './conversation-menu';

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Newest first, with title and date (US-10), pinned ones in their own group on top. Each has a
// "..." menu to pin, archive, rename, share or delete it (US-12). Archived ones are listed on
// request at the bottom. The search box finds conversations by words in their messages (§7.15).
export function ConversationList({ conversations, canShare }: { conversations: ConversationSummary[]; canShare: boolean }) {
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
        <>
          {!results && shown.some((c) => c.pinned) && (
            <Group label="Pinned" icon={<PinIcon />}>
              {shown
                .filter((c) => c.pinned)
                .map((c) => (
                  <ConversationItem key={c.id} conversation={c} canShare={canShare} />
                ))}
            </Group>
          )}
          <ul className="space-y-0.5">
            {shown
              .filter((c) => results || !c.pinned)
              .map((c) => (
                <ConversationItem key={c.id} conversation={c} canShare={canShare} />
              ))}
          </ul>
        </>
      )}
      {!results && <ArchivedList canShare={canShare} />}
    </div>
  );
}

function Group({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-[#4ade80]">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {label}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

// Archived conversations stay out of the way until asked for, then can be restored or deleted.
function ArchivedList({ canShare }: { canShare: boolean }) {
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toggle = () =>
    list
      ? setList(null)
      : startTransition(async () => {
          const result = await listArchivedAction();
          if (result.ok) setList(result.conversations);
          else setError(result.error);
        });
  return (
    <div className="border-t border-white/10 pt-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-expanded={list !== null}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs text-zinc-400 hover:text-white"
      >
        <span className="[&_svg]:size-3.5">
          <ArchiveIcon />
        </span>
        {pending ? 'Loading…' : list ? 'Hide archived' : 'Archived chats'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-[#ff7385]">
          {error}
        </p>
      )}
      {list &&
        (list.length === 0 ? (
          <p className="px-1 text-xs text-zinc-500">Nothing archived.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {list.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                canShare={canShare}
                onGone={() => setList((l) => l?.filter((x) => x.id !== c.id) ?? null)}
              />
            ))}
          </ul>
        ))}
    </div>
  );
}

function ConversationItem({
  conversation,
  canShare,
  onGone,
}: {
  conversation: ConversationSummary;
  canShare: boolean;
  onGone?: () => void;
}) {
  const href = `/c/${conversation.id}`;
  const current = usePathname() === href;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [share, setShare] = useState<{ id: string; url: string; copied: boolean } | null>(null);

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else {
        setError(null);
        after?.();
      }
    });

  const choose = (action: MenuAction) => {
    if (action === 'pin') run(() => pinConversationAction(conversation.id, !conversation.pinned));
    if (action === 'archive')
      run(
        () => archiveConversationAction(conversation.id, !conversation.archived),
        () => {
          onGone?.();
          if (current && !conversation.archived) router.push('/');
        },
      );
    if (action === 'rename') setEditing(true);
    if (action === 'share')
      startTransition(async () => {
        const result = await shareConversationAction(conversation.id);
        if (!result.ok) return setError(result.error);
        const url = `${window.location.origin}/s/${result.id}`;
        let copied = false;
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch {
          // The link is shown below, so it can still be copied by hand.
        }
        setError(null);
        setShare({ id: result.id, url, copied });
      });
    if (action === 'delete') remove();
  };

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
      else {
        onGone?.();
        if (current) router.push('/');
      }
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
          <div className="flex items-start gap-1">
            <Link href={href} className="block min-w-0 flex-1" aria-current={current ? 'page' : undefined}>
              <span className={`block truncate ${current ? 'text-white' : 'text-zinc-200'}`}>{conversation.title}</span>
              <span className="text-xs text-zinc-500">{shortDate(conversation.updatedAt)}</span>
            </Link>
            {/* Always visible on touch screens; on larger screens it shows on hover or keyboard focus. */}
            <div className="opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
              <ConversationMenu
                title={conversation.title}
                pinned={conversation.pinned}
                archived={conversation.archived}
                canShare={canShare}
                disabled={pending}
                onChoose={choose}
              />
            </div>
          </div>
          {share && (
            <div className="mt-1.5 space-y-1.5 rounded-lg border border-[#4ade80]/40 bg-[#4ade80]/10 p-2 text-xs text-zinc-200">
              <p>
                {share.copied ? 'Link copied. ' : ''}Anyone with it can read the latest answer for 30 days. It doesn&apos;t show who
                you are.
              </p>
              <input readOnly value={share.url} aria-label="Share link" className="sidebar-input py-1 text-xs" />
              <div className="flex gap-3">
                <button
                  type="button"
                  className="font-semibold text-white underline"
                  onClick={() => navigator.clipboard.writeText(share.url).then(() => setShare({ ...share, copied: true }))}
                >
                  Copy link
                </button>
                <button
                  type="button"
                  className="text-[#ff7385] underline"
                  disabled={pending}
                  onClick={() => run(() => revokeShareAction(share.id), () => setShare(null))}
                >
                  Stop sharing
                </button>
                <button type="button" className="ml-auto text-zinc-400 underline" onClick={() => setShare(null)}>
                  Close
                </button>
              </div>
            </div>
          )}
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
