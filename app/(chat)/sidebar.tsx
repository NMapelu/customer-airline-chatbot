'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { ChartIcon, ChecklistIcon, PlusIcon, SettingsIcon, SignOutIcon } from '@/components/icons';
import type { ConversationSummary } from '@/lib/chat/history';
import type { Role } from '@/lib/rag/types';
import { SignOutButton } from '../(auth)/sign-out-button';
import { ConversationList } from './conversation-list';

function NavLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  const current = usePathname() === href;
  return (
    <Link href={href} prefetch={false} className="nav-link" aria-current={current ? 'page' : undefined}>
      {icon}
      {children}
    </Link>
  );
}

// The dark sidebar on every signed-in page: a new chat, the pages this account can use, the
// conversation history (US-10) and who is signed in. Passengers see the checklist; administrators
// see Insights. Agents see neither.
export function Sidebar({
  conversations,
  email,
  role,
  isAdmin,
}: {
  conversations: ConversationSummary[];
  email: string;
  role: Role;
  isAdmin: boolean;
}) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-4">
      <div className="hidden px-1 md:block">
        <Brand />
      </div>
      <Link href="/" prefetch={false} className="btn btn-primary w-full">
        <PlusIcon />
        New chat
      </Link>
      <div className="space-y-1">
        {role === 'customer' && (
          <NavLink href="/checklist" icon={<ChecklistIcon />}>
            Pre-travel checklist
          </NavLink>
        )}
        <NavLink href="/settings" icon={<SettingsIcon />}>
          Settings
        </NavLink>
        {isAdmin && (
          <NavLink href="/admin" icon={<ChartIcon />}>
            Insights
          </NavLink>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#2c2c33] pt-4">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Your conversations</p>
        <ConversationList conversations={conversations} />
      </div>
      <div className="flex items-center gap-2 border-t border-[#2c2c33] pt-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white" title={email}>
            {email}
          </p>
          <p className="text-xs text-zinc-400">{role === 'agent' ? 'Call-centre agent' : isAdmin ? 'Passenger · administrator' : 'Passenger'}</p>
        </div>
        <SignOutButton className="nav-link px-2" >
          <SignOutIcon />
          <span className="sr-only">Sign out</span>
        </SignOutButton>
      </div>
    </nav>
  );
}
