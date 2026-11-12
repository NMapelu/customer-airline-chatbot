'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordReset } from '../actions';
import { Field, FormError, FormTitle, Submit } from '../ui';

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  if (state?.done) {
    return (
      <div className="space-y-3">
        <FormTitle title="Check your email">
          If there is an account for this email, we&apos;ve sent a link to reset the password. Open it in this browser
          within an hour. You&apos;ll also need a code from your authenticator app. If it isn&apos;t in your inbox, look in
          your spam folder.
        </FormTitle>
        <Link href="/login" className="btn btn-outline w-full">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <FormTitle title="Reset your password">Enter your account&apos;s email and we&apos;ll send you a link to choose a new password.</FormTitle>
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state?.email} required />
      <FormError message={state?.error} />
      <Submit pending={pending}>Send reset link</Submit>
      <p className="text-center text-sm text-muted">
        Remembered it?{' '}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
    </form>
  );
}
