import { MenuIcon } from '@/components/icons';
import { Brand } from '@/components/brand';
import { listConversations } from '@/lib/chat/history';
import { requireAal2 } from '@/lib/supabase/server';
import { Sidebar } from './sidebar';

// The signed-in area: the dark sidebar (navigation and history, overview §7.2, US-10) next to the
// page. On small screens the sidebar folds into a menu under a top bar.
export default async function ChatLayout({ children }: LayoutProps<'/'>) {
  const { supabase, user, role } = await requireAal2();
  const conversations = await listConversations(supabase);
  const sidebar = (
    <Sidebar conversations={conversations} email={user.email ?? ''} role={role} isAdmin={user.app_metadata?.role === 'admin'} />
  );

  return (
    <div className="flex h-dvh flex-col md:flex-row print:block print:h-auto">
      <aside className="sidebar hidden w-72 shrink-0 p-4 md:block print:hidden">{sidebar}</aside>
      <details className="sidebar group md:hidden print:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
          <Brand />
          <span className="nav-link px-2" aria-hidden="true">
            <MenuIcon />
          </span>
          <span className="sr-only">Menu</span>
        </summary>
        <div className="max-h-[75dvh] overflow-y-auto px-4 pb-4">{sidebar}</div>
      </details>
      <main className="flex min-h-0 flex-1 flex-col print:block">
        {role === 'agent' && (
          // Overview §7.14: always clear which rules apply. Agents can't switch to customer mode.
          <div role="note" className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 print:hidden">
            <span className="badge badge-solid">Agent mode</span>
            <span>
              Answers include internal procedures marked <em>Internal</em>. Read callers only the <em>Customer-ready wording</em>.
            </span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
