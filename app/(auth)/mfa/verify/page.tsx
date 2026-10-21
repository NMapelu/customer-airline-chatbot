'use client';

import { useActionState } from 'react';
import { verifyCode } from '../../actions';
import { Field, FormError, Submit } from '../../ui';
import { SignOutButton } from '../../sign-out-button';

// Every sign-in after the first (US-04): the password got the user to AAL1; the code makes it AAL2.
export default function VerifyPage() {
  const [state, action, pending] = useActionState(verifyCode, undefined);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <h1 className="text-xl font-semibold">Enter your code</h1>
        <p className="text-sm">Open your authenticator app and enter the 6-digit code for KQ Policy Assistant.</p>
        <Field label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus />
        <FormError message={state?.error} />
        <Submit pending={pending}>Verify</Submit>
      </form>
      <p className="text-xs text-gray-600">
        Lost your authenticator? Account recovery is manual for now: contact the project owner (see the README).
      </p>
      <SignOutButton />
    </div>
  );
}
