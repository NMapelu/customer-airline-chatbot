'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { PASSWORD_MIN, PASSWORD_RULE } from '@/lib/auth/password-rule';
import { signUp } from '../actions';
import { Field, FormError, FormTitle, Submit } from '../ui';

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUp, undefined);
  if (state?.done) {
    return (
      <div className="space-y-3">
        <FormTitle title="Check your email">
          If this email can be used, we&apos;ve sent a link to confirm it. Open the link, then sign in and set up an
          authenticator app. If it isn&apos;t in your inbox, look in your spam folder.
        </FormTitle>
        <Link href="/login" className="btn btn-primary w-full">
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <FormTitle title="Create an account">For Kenya Airways passengers. It takes about two minutes.</FormTitle>
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state?.email} required />
      <div>
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          required
          aria-describedby="password-rule"
        />
        <p id="password-rule" className="mt-1 text-xs text-muted">
          Use {PASSWORD_RULE}.
        </p>
      </div>
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
      <p className="text-xs text-muted">
        You&apos;ll also need an authenticator app (such as Google Authenticator or Microsoft Authenticator) on your phone.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1 accent-[#c8102e]" />
        <span>
          I have read the{' '}
          <Link href="/privacy" target="_blank" className="link">
            privacy notice
          </Link>{' '}
          and agree to my data being processed as it describes, including by OpenAI.
        </span>
      </label>
      <FormError message={state?.error} />
      <Submit pending={pending}>Create account</Submit>
      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
    </form>
  );
}
