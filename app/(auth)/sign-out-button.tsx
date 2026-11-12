import type { ReactNode } from 'react';
import { signOut } from './actions';

export function SignOutButton({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <form action={signOut}>
      <button type="submit" className={className ?? 'text-sm text-muted underline'}>
        {children ?? 'Sign out'}
      </button>
    </form>
  );
}
