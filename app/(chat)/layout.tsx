import Link from 'next/link';
import { listConversations } from '@/lib/chat/history';
import { requireAal2 } from '@/lib/supabase/server';
import { ConversationList } from './conversation-list';

// The signed-in area: the history sidebar (overview §7.2, US-10) next to the chat.
// On small screens the sidebar folds into a "Conversations" toggle above the chat.
export default async function ChatLayout({ children }: LayoutProps<'/'>) {
  const { supabase, user, role } = await requireAal2();
  const conversations = await listConversations(supabase);

  const sidebar = (
    <nav aria-label="Conversations" className="flex flex-col gap-3">
      <Link href="/" prefetch={false} className="rounded bg-blue-600 px-3 py-2 text-center text-sm font-semibold text-white">
        New chat
      </Link>
      {role === 'customer' && (
        <Link href="/checklist" prefetch={false} className="rounded border border-blue-600 px-3 py-2 text-center text-sm font-semibold text-blue-700">
          Pre-travel checklist
        </Link>
      )}
      <ConversationList conversations={conversations} />
      <div className="mt-auto border-t border-gray-300 pt-3 text-xs text-gray-600">
        <p className="truncate" title={user.email}>
          {user.email}
          {role === 'agent' && <span className="ml-1 font-semibold">(agent)</span>}
        </p>
        <Link href="/settings" className="text-blue-700 underline">
          Settings
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="flex h-dvh flex-col md:flex-row print:block print:h-auto">
      <aside className="hidden print:hidden w-72 shrink-0 flex-col overflow-y-auto border-r border-gray-300 bg-gray-50 p-3 text-black md:flex">
        {sidebar}
      </aside>
      <details className="border-b border-gray-300 bg-gray-50 p-3 text-black md:hidden print:hidden">
        <summary className="cursor-pointer text-sm font-semibold">Conversations</summary>
        <div className="mt-3">{sidebar}</div>
      </details>
      <main className="flex min-h-0 flex-1 flex-col print:block">
        {role === 'agent' && (
          // Overview §7.14: always clear which rules apply. Agents can't switch to customer mode.
          <div role="note" className="print:hidden border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-950">
            <strong>Agent mode.</strong> Answers include internal procedures marked <em>Internal</em>. Read callers only
            the <em>Customer-ready wording</em>.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
