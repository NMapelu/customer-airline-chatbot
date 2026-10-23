import type { ComponentProps, ReactNode } from 'react';

// Small shared pieces for the auth and settings forms, so every form looks and reads the same.

export function Field({ label, ...input }: { label: string } & ComponentProps<'input'>) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input className="input mt-1.5" {...input} />
    </label>
  );
}

export function Submit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending ? 'Please wait…' : children}
    </button>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="notice notice-error">
      {message}
    </p>
  );
}

// The heading and short explanation at the top of each auth card.
export function FormTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-1">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {children && <p className="text-sm text-muted">{children}</p>}
    </div>
  );
}
