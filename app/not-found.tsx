import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-md space-y-3 p-6 text-sm">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p>This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="text-blue-700 underline">
        Go to the start
      </Link>
    </main>
  );
}
