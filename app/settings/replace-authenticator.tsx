'use client';

import { useActionState, useState, useTransition } from 'react';
import type { EnrolStart } from '@/lib/auth/mfa';
import { FormError, Field, Submit } from '../(auth)/ui';
import { QrCode } from '../(auth)/mfa/enroll/qr-code';
import { finishReplacement, startReplacement } from './actions';

// US-13: a code from the current app, then the new app's QR code and a code from it.
export function ReplaceAuthenticator() {
  const [start, setStart] = useState<EnrolStart | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, action, pending] = useActionState(finishReplacement, undefined);

  if (state?.done) {
    return <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-900">Done. Use the new app from now on.</p>;
  }
  if (!start?.ok) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const code = new FormData(e.currentTarget).get('currentCode');
          startTransition(async () => setStart(await startReplacement(typeof code === 'string' ? code : '')));
        }}
        className="space-y-2 rounded border border-gray-300 p-3"
      >
        <p className="text-sm font-medium">Replace my authenticator app</p>
        <Field label="Code from your current app" name="currentCode" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
        <FormError message={start && !start.ok ? start.error : null} />
        <Submit pending={starting}>Continue</Submit>
      </form>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded border border-gray-300 p-3">
      <QrCode qr={start.qr} secret={start.secret} />
      <input type="hidden" name="factorId" value={start.factorId} />
      <Field label="Code from your new app" name="newCode" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
      <FormError message={state?.error} />
      <Submit pending={pending}>Replace</Submit>
    </form>
  );
}
