'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signIn } from '../actions';
import { Field, FormError, FormTitle, Submit } from '../ui';

export function SignInForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormTitle title="Welcome back">Sign in with your email and password. Next you&apos;ll enter a code from your authenticator app.</FormTitle>
      {notice && (
        <p role="status" className="notice notice-ok">
          {notice}
        </p>
      )}
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state?.email} required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <FormError message={state?.error} />
      <Submit pending={pending}>Sign in</Submit>
      <p className="text-center text-sm text-muted">
        New here?{' '}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </p>
    </form>
  );
}
