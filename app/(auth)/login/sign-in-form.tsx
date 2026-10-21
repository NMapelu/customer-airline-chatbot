'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signIn } from '../actions';
import { Field, FormError, Submit } from '../ui';

export function SignInForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {notice && <p className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-900">{notice}</p>}
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state?.email} required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <FormError message={state?.error} />
      <Submit pending={pending}>Sign in</Submit>
      <p className="text-sm">
        New here?{' '}
        <Link href="/signup" className="text-blue-700 underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
