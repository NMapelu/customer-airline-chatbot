'use client';

import Link from 'next/link';

// Overview §10.0 fail-safe defaults: a plain message, never the error itself. In production
// Next.js sends the browser only a reference (the digest), which matches the Worker's log entry.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-md space-y-3 p-6 text-sm">
      <h1 className="text-xl font-semibold">Sorry, something went wrong</h1>
      <p>Please try again. If it keeps happening, come back a little later.</p>
      {error.digest && <p className="text-gray-600">Reference: {error.digest}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={() => retry()} className="rounded bg-blue-600 px-3 py-1.5 font-semibold text-white">
          Try again
        </button>
        <Link href="/" className="px-3 py-1.5 text-blue-700 underline">
          Go to the start
        </Link>
      </div>
    </main>
  );
}
