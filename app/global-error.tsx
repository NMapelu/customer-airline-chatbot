'use client';

// Shown when the root layout itself fails, in place of the whole page. Styles aren't loaded here,
// so it stays plain. Like app/error.tsx, it never shows the error itself.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · KQ Policy Assistant</title>
        <h1>Sorry, something went wrong</h1>
        <p>Please try again. If it keeps happening, come back a little later.</p>
        {error.digest && <p>Reference: {error.digest}</p>}
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
