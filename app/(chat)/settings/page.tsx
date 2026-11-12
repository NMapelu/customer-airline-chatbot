import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { appearanceFrom } from '@/lib/appearance';
import { listShares } from '@/lib/chat/shares';
import { requireAal2 } from '@/lib/supabase/server';
import { SignOutButton } from '../../(auth)/sign-out-button';
import { AppearanceSettings } from './appearance';
import { DeleteAccount } from './delete-account';
import { ReplaceAuthenticator } from './replace-authenticator';
import { SharedLinks } from './shared-links';

export const metadata: Metadata = { title: 'Settings · KQ Chatbot' };

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function Section({ title, description, tone, children }: { title: string; description?: ReactNode; tone?: 'danger'; children: ReactNode }) {
  return (
    <section className={`card space-y-3 p-5 ${tone === 'danger' ? 'border-brand' : ''}`}>
      <div>
        <h2 className={`text-base font-semibold ${tone === 'danger' ? 'text-brand' : ''}`}>{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// Account and security settings (overview §7.4), and account deletion (§11).
export default async function SettingsPage() {
  const { supabase, user, role } = await requireAal2();
  const shares = role === 'agent' ? [] : await listShares(supabase);
  const authenticators = (user.factors ?? []).filter((f) => f.factor_type === 'totp' && f.status === 'verified');

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
        <PageHeader title="Settings" description="Your account, display and sign-in security." />

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Account">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Email</dt>
                <dd className="break-all font-medium">{user.email}</dd>
              </div>
              <div>
                <dt className="text-muted">Account type</dt>
                <dd>
                  <span className={`badge ${role === 'agent' ? 'badge-solid' : 'badge-ok'}`}>
                    {role === 'agent' ? 'Call-centre agent' : 'Passenger'}
                  </span>
                </dd>
              </div>
            </dl>
            <SignOutButton className="btn btn-ok w-full">Sign out of this browser</SignOutButton>
          </Section>

          <Section title="Display" description="Saved with your account, on every device.">
            <AppearanceSettings initial={appearanceFrom(user.user_metadata)} />
          </Section>
        </div>

        <Section
          title="Two-step sign-in"
          description={
            <>
              <span className="badge badge-ok mr-1">On</span> It can&apos;t be turned off. You sign in with your password and a code
              from{' '}
              {authenticators.map((f) => `${f.friendly_name ?? 'your authenticator app'}, added ${longDate(f.created_at)}`).join('; ')}.
            </>
          }
        >
          <ReplaceAuthenticator />
        </Section>

        {role !== 'agent' && (
          <Section
            title="Shared answers"
            description="Links you shared stop working after 30 days, or straight away when you stop sharing them."
          >
            <SharedLinks shares={shares} />
          </Section>
        )}

        <Section
          title="Delete my account"
          tone="danger"
          description={
            <>
              See the{' '}
              <Link href="/privacy" className="link">
                privacy notice
              </Link>{' '}
              for what we keep and for how long.
            </>
          }
        >
          {role === 'agent' ? <p className="text-sm">Agent accounts are removed by your administrator.</p> : <DeleteAccount />}
        </Section>
      </div>
    </div>
  );
}
