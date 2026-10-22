'use client';

import { useActionState } from 'react';
import { PASSWORD_MIN, PASSWORD_RULE } from '@/lib/auth/schemas';
import { choosePassword } from '../actions';
import { Field, FormError, Submit } from '../ui';

export function ChoosePasswordForm() {
  const [state, action, pending] = useActionState(choosePassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Set up your agent account</h1>
      <p className="text-sm">Choose a password. Next you&apos;ll set up an authenticator app.</p>
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
      <FormError message={state?.error} />
      <Submit pending={pending}>Save password</Submit>
    </form>
  );
}
