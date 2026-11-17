import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Switch } from '@/components/switch';
import { ChatIcon, PlusIcon } from '@/components/icons';
import { appearanceFrom } from '@/lib/appearance';
import { listConversations } from '@/lib/chat/history';
import { firstNameFromEmail } from '@/lib/profile/first-name';
import { memberFor, profileStats } from '@/lib/profile/stats';
import { requireAal2 } from '@/lib/supabase/server';
import { SignOutButton } from '../../(auth)/sign-out-button';
import { AppearanceSettings } from './appearance';
import { DeleteAccount } from './delete-account';
import { ProfileBanner } from './profile-banner';
import { ReplaceAuthenticator } from './replace-authenticator';
import { StatTiles } from './stat-tiles';

export const metadata: Metadata = { title: 'Your profile · KQ Chatbot' };

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' });
const todayInNairobi = () =>
  new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' });

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

// The profile page (overview §7.4): a personal dashboard with a greeting, a few numbers about the
// person's own use, their latest conversations, and their account, display and sign-in settings.
// Account deletion (§11) stays at the bottom.
export default async function ProfilePage() {
  const { supabase, user, role } = await requireAal2();
  const [stats, conversations] = await Promise.all([profileStats(supabase), listConversations(supabase)]);
  const recent = conversations.slice(0, 4);
  const firstName = firstNameFromEmail(user.email);
  const authenticators = (user.factors ?? []).filter((f) => f.factor_type === 'totp' && f.status === 'verified');

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        <ProfileBanner firstName={firstName} today={todayInNairobi()} />
        <StatTiles stats={stats} memberFor={memberFor(user.created_at)} />

        <div className="grid gap-5 lg:grid-cols-3">
          <section className="card card-brand space-y-3 p-5 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Your recent conversations</h2>
              <Link href="/" prefetch={false} className="btn btn-primary btn-sm">
                <PlusIcon />
                New chat
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="rounded-lg bg-brand-soft p-4 text-sm">
                No conversations yet. Ask your first question about baggage, check-in or refunds.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {recent.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/c/${c.id}`}
                      prefetch={false}
                      className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-brand-soft"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
                        <ChatIcon />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
                      <span className="shrink-0 text-xs text-muted">{shortDate(c.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Section title="Account">
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#c8102e] text-lg font-semibold text-white" aria-hidden="true">
                {(firstName ?? user.email ?? '?').charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{firstName ?? 'Your account'}</p>
                <p className="break-all text-sm text-muted">{user.email}</p>
              </div>
            </div>
            <dl className="space-y-2 border-t border-line pt-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Member since</dt>
                <dd className="font-medium">{longDate(user.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Two-step sign-in</dt>
                <dd>
                  <span className="badge badge-solid">On</span>
                </dd>
              </div>
            </dl>
            <SignOutButton className="btn btn-outline w-full">Sign out of this browser</SignOutButton>
          </Section>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Section
            title="Sign-in security"
            description={`You sign in with your password and a code from ${authenticators
              .map((f) => `${f.friendly_name ?? 'your authenticator app'}, added ${longDate(f.created_at)}`)
              .join('; ')}.`}
          >
            <Switch
              label="Two-step sign-in"
              checked
              locked
              lockedReason="Always on, to keep your conversations private."
            />
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-brand">Moving to a new phone?</summary>
              <div className="mt-3">
                <ReplaceAuthenticator />
              </div>
            </details>
          </Section>

          <Section title="Display" description="Saved with your account, on every device.">
            <AppearanceSettings initial={appearanceFrom(user.user_metadata)} />
          </Section>
        </div>

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
