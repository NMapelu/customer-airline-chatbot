import Link from 'next/link';
import { Brand } from '@/components/brand';
import { ShieldIcon } from '@/components/icons';
import { DISCLAIMER } from '@/lib/legal';

// Sign-in, sign-up and MFA pages: a dark panel saying what the assistant does, next to one form
// card. On phones the panel shrinks to a header above the card. The disclaimer (overview §13) is
// always visible.
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="grid min-h-dvh md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="sidebar flex flex-col justify-between gap-8 px-6 py-8 md:px-10 md:py-12">
        <Brand />
        <div className="hidden space-y-5 md:block">
          <h2 className="max-w-sm text-3xl font-semibold leading-tight text-white">
            Kenya Airways policies, answered with the source every time.
          </h2>
          <ul className="max-w-sm space-y-3 text-sm text-zinc-300">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#c8102e]" aria-hidden="true" />
              Baggage, check-in, refunds, special assistance and more, from the published policies.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#c8102e]" aria-hidden="true" />
              Questions it can&apos;t answer go to Kenya Airways customer service, never a guess.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#c8102e]" aria-hidden="true" />
              Call-centre agents get their internal procedures too, by invitation.
            </li>
          </ul>
        </div>
        <p className="hidden max-w-sm items-start gap-2 text-xs text-zinc-400 md:flex">
          <ShieldIcon />
          <span>Every account uses a code from an authenticator app. Sign-in activity is recorded for security.</span>
        </p>
      </section>
      <section className="flex flex-col items-center justify-center gap-5 px-4 py-8">
        <div className="card w-full max-w-sm p-6 sm:p-8">{children}</div>
        <footer className="w-full max-w-sm space-y-2 text-xs text-muted">
          <p>{DISCLAIMER}</p>
          <Link href="/privacy" className="link">
            Privacy notice
          </Link>
        </footer>
      </section>
    </main>
  );
}
