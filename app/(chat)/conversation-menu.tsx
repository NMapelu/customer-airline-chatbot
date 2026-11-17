'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArchiveIcon, DotsIcon, PencilIcon, PinIcon, ShareIcon, TrashIcon } from '@/components/icons';

export type MenuAction = 'pin' | 'archive' | 'rename' | 'share' | 'delete';

// The "..." button on each conversation, opening Pin, Archive, Rename, Share and Delete in that
// order. Closes on Escape, on a click outside, or after choosing. Arrow keys move between items.
export function ConversationMenu({
  title,
  pinned,
  archived,
  canShare,
  disabled,
  onChoose,
}: {
  title: string;
  pinned: boolean;
  archived: boolean;
  canShare: boolean;
  disabled: boolean;
  onChoose: (action: MenuAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    box.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const items: { action: MenuAction; label: string; icon: ReactNode; danger?: boolean }[] = [
    ...(archived ? [] : [{ action: 'pin' as const, label: pinned ? 'Unpin' : 'Pin', icon: <PinIcon /> }]),
    { action: 'archive', label: archived ? 'Restore' : 'Archive', icon: <ArchiveIcon /> },
    ...(archived ? [] : [{ action: 'rename' as const, label: 'Rename', icon: <PencilIcon /> }]),
    ...(canShare && !archived ? [{ action: 'share' as const, label: 'Share', icon: <ShareIcon /> }] : []),
    { action: 'delete', label: 'Delete', icon: <TrashIcon />, danger: true },
  ];

  const moveFocus = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      box.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...(box.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  };

  return (
    <div ref={box} className="relative" onKeyDown={moveFocus}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`More for "${title}"`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`flex size-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-white ${open ? 'bg-white/10 text-white' : ''}`}
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Actions for "${title}"`}
          className="menu-pop absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#1b1b20] p-1 shadow-2xl"
        >
          {items.map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onChoose(item.action);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition focus:bg-white/10 ${
                item.danger ? 'text-[#ff7385] hover:bg-[#c8102e] hover:text-white' : 'text-zinc-200 hover:bg-white/10'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
