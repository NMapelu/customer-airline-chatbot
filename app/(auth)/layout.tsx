import Link from 'next/link';
import { DISCLAIMER } from '@/lib/legal';

// Sign-in, sign-up and MFA pages: one narrow card, centred, with what the assistant covers and
// the disclaimer (overview §13) underneath.
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-300 bg-surface p-6 text-black shadow">
        <p className="mb-4 text-sm font-semibold text-blue-700">KQ Policy Assistant</p>
        {children}
      </div>
      <footer className="w-full max-w-sm space-y-2 text-xs text-gray-600">
        <p>
          Answers questions about Kenya Airways&apos; published policies, such as baggage, check-in, refunds and special
          assistance, and shows the source of each answer.
        </p>
        <p>{DISCLAIMER}</p>
        <Link href="/privacy" className="text-blue-700 underline">
          Privacy notice
        </Link>
      </footer>
    </main>
  );
}
