'use client';

import { useActionState } from 'react';
import { verifyCode } from '../../actions';
import { Field, FormError, FormTitle, Submit } from '../../ui';
import { SignOutButton } from '../../sign-out-button';

// Every sign-in after the first (US-04): the password got the user to AAL1; the code makes it AAL2.
export default function VerifyPage() {
  const [state, action, pending] = useActionState(verifyCode, undefined);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <FormTitle title="Enter your code">Open your authenticator app and enter the 6-digit code for KQ Policy Assistant.</FormTitle>
        <Field label="6-digit code" name="code" className="input mt-1.5 text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus />
        <FormError message={state?.error} />
        <Submit pending={pending}>Verify</Submit>
      </form>
      <p className="text-xs text-muted">
        Lost your authenticator? Account recovery is manual for now: contact the project owner (see the README).
      </p>
      <SignOutButton className="btn btn-ok w-full" />
    </div>
  );
}
