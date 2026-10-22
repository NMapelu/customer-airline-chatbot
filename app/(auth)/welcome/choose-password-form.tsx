'use client';

import { useActionState } from 'react';
import { PASSWORD_MIN, PASSWORD_RULE } from '@/lib/auth/password-rule';
import { choosePassword } from '../actions';
import { Field, FormError, FormTitle, Submit } from '../ui';

export function ChoosePasswordForm() {
  const [state, action, pending] = useActionState(choosePassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormTitle title="Set up your agent account">Choose a password. Next you&apos;ll set up an authenticator app.</FormTitle>
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
      <FormError message={state?.error} />
      <Submit pending={pending}>Save password</Submit>
    </form>
  );
}
