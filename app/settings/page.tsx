import Link from 'next/link';
import { requireAal2 } from '@/lib/supabase/server';
import { SignOutButton } from '../(auth)/sign-out-button';
import { DeleteAccount } from './delete-account';
import { ReplaceAuthenticator } from './replace-authenticator';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Account and security settings (overview §7.4), and account deletion (§11).
export default async function SettingsPage() {
  const { user, role } = await requireAal2();
  const authenticators = (user.factors ?? []).filter((f) => f.factor_type === 'totp' && f.status === 'verified');

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 p-6">
      <Link href="/" className="text-sm text-blue-700 underline">
        Back to the chat
      </Link>
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="space-y-1">
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="text-sm">Email: {user.email}</p>
        <p className="text-sm">Account type: {role === 'agent' ? 'Call-centre agent' : 'Passenger'}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Two-step sign-in</h2>
        <p className="text-sm">
          On. It can&apos;t be turned off. You sign in with your password and a code from:{' '}
          {authenticators.map((f) => `${f.friendly_name ?? 'Authenticator app'}, added ${longDate(f.created_at)}`).join('; ')}
        </p>
        <ReplaceAuthenticator />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sign out</h2>
        <p className="text-sm">Signs you out of this browser.</p>
        <SignOutButton className="rounded border border-gray-400 px-3 py-1.5 text-sm" />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Delete my account</h2>
        {role === 'agent' ? (
          <p className="text-sm">Agent accounts are removed by your administrator.</p>
        ) : (
          <DeleteAccount />
        )}
        <p className="text-sm">
          See the{' '}
          <Link href="/privacy" className="text-blue-700 underline">
            privacy notice
          </Link>{' '}
          for what we keep and for how long.
        </p>
      </section>
    </main>
  );
}
