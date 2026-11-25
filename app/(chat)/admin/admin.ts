import { notFound } from 'next/navigation';
import { freshCodeUntil } from '@/lib/admin/accounts';
import { requireAal2 } from '@/lib/supabase/server';

// For the /admin pages: administrators only. Anyone else gets a 404, and the database refuses them too.
// The role comes from Supabase Auth on every request (getUser), not from an old token.
export async function requireAdmin() {
  const context = await requireAal2();
  if (context.user.app_metadata?.role !== 'admin') notFound();
  return context;
}

// Until when changes are allowed without asking for another code (ms since 1970), or null.
export async function codeFreshUntil(supabase: Awaited<ReturnType<typeof requireAal2>>['supabase']): Promise<number | null> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data ? freshCodeUntil(data.currentAuthenticationMethods) : null;
}

const nairobi = { timeZone: 'Africa/Nairobi' } as const;
export const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { ...nairobi, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';
export const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { ...nairobi, day: 'numeric', month: 'short', year: 'numeric' });
