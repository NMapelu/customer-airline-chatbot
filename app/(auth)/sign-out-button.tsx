import { signOut } from './actions';

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOut}>
      <button type="submit" className={className ?? 'text-sm text-gray-600 underline'}>
        Sign out
      </button>
    </form>
  );
}
