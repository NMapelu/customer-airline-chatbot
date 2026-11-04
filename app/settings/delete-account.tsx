'use client';

import { useActionState } from 'react';
import { FormError, Field, Submit } from '../(auth)/ui';
import { deleteAccount } from './actions';

// Overview §11: deletes the account and every conversation in it, after a fresh authenticator code.
export function DeleteAccount() {
  const [state, action, pending] = useActionState(deleteAccount, undefined);
  return (
    <form action={action} className="space-y-2 rounded border border-red-300 p-3">
      <p className="text-sm">
        Deletes your account and all your conversations straight away. This can&apos;t be undone. A record that an account
        was deleted is kept for 12 months, without your email address.
      </p>
      <Field label="Code from your authenticator app" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="mt-1" />
        <span>I understand my account and conversations will be deleted permanently.</span>
      </label>
      <FormError message={state?.error} />
      <Submit pending={pending}>Delete my account</Submit>
    </form>
  );
}
