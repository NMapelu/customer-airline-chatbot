import Link from 'next/link';
import { Brand } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-4 p-8 text-center">
        <div className="flex justify-center">
          <Brand tone="light" />
        </div>
        <p className="text-5xl font-semibold text-brand">404</p>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Link href="/" className="btn btn-primary">
          Go to the start
        </Link>
      </div>
    </main>
  );
}
