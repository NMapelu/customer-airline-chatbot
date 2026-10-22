'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { PASSWORD_MIN, PASSWORD_RULE } from '@/lib/auth/password-rule';
import { signUp } from '../actions';
import { Field, FormError, Submit } from '../ui';

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUp, undefined);
  if (state?.done) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm">
          If this email can be used, we&apos;ve sent a link to confirm it. Open the link, then sign in and set up an
          authenticator app.
        </p>
        <Link href="/login" className="text-sm text-blue-700 underline">
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Create an account</h1>
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
        <p id="password-rule" className="mt-1 text-xs text-gray-600">
          Use {PASSWORD_RULE}.
        </p>
      </div>
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
      <p className="text-xs text-gray-600">
        You&apos;ll also need an authenticator app (such as Google Authenticator or Microsoft Authenticator) on your phone.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>
          I have read the{' '}
          <Link href="/privacy" target="_blank" className="text-blue-700 underline">
            privacy notice
          </Link>{' '}
          and agree to my data being processed as it describes, including by OpenAI.
        </span>
      </label>
      <FormError message={state?.error} />
      <Submit pending={pending}>Create account</Submit>
      <p className="text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-700 underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
