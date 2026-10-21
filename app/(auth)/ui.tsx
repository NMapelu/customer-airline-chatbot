import type { ComponentProps, ReactNode } from 'react';

// Small shared pieces for the auth forms, so every form looks and reads the same.

export function Field({ label, ...input }: { label: string } & ComponentProps<'input'>) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5" {...input} />
    </label>
  );
}

export function Submit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? 'Please wait…' : children}
    </button>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}
