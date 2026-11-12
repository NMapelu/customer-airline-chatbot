'use client';

import { useActionState } from 'react';
import { PASSWORD_MIN, PASSWORD_RULE } from '@/lib/auth/password-rule';
import { choosePassword, setNewPassword } from './actions';
import { Field, FormError, FormTitle, Submit } from './ui';

// Choosing a password without the old one: an invited agent's first password (app/(auth)/welcome),
// or a new one after a reset link (app/(auth)/new-password).
const PURPOSES = {
  agent: { action: choosePassword, title: 'Set up your agent account', intro: "Choose a password. Next you'll set up an authenticator app." },
  reset: { action: setNewPassword, title: 'Choose a new password', intro: "You'll use it with your authenticator app from now on." },
};

export function PasswordForm({ purpose }: { purpose: keyof typeof PURPOSES }) {
  const { action: save, title, intro } = PURPOSES[purpose];
  const [state, action, pending] = useActionState(save, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormTitle title={title}>{intro}</FormTitle>
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
