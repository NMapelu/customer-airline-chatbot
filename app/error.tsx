'use client';

import Link from 'next/link';

// Overview §10.0 fail-safe defaults: a plain message, never the error itself. In production
// Next.js sends the browser only a reference (the digest), which matches the Worker's log entry.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="card card-brand w-full max-w-md space-y-3 p-8 text-sm">
        <h1 className="text-xl font-semibold">Sorry, something went wrong</h1>
        <p className="text-muted">Please try again. If it keeps happening, come back a little later.</p>
        {error.digest && <p className="text-xs text-muted">Reference: {error.digest}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => retry()} className="btn btn-primary">
            Try again
          </button>
          <Link href="/" className="btn btn-ok">
            Go to the start
          </Link>
        </div>
      </div>
    </main>
  );
}
