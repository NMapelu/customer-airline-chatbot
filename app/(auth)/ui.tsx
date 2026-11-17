import type { ComponentProps, ReactNode } from 'react';

// Small shared pieces for the auth and settings forms, so every form looks and reads the same.

// An optional icon sits inside the box on the left (for example an envelope for email). It is
// decorative: the label carries the meaning.
export function Field({ label, icon, ...input }: { label: string; icon?: ReactNode } & ComponentProps<'input'>) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {icon ? (
        <span className="relative mt-1.5 block">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">{icon}</span>
          <input className="input input-lg pl-10" {...input} />
        </span>
      ) : (
        <input className="input mt-1.5" {...input} />
      )}
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
    <div className="space-y-1.5 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <p className="text-sm text-muted">{children}</p>}
    </div>
  );
}
