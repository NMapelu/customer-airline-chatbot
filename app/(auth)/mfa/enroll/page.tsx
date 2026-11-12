'use client';

import { useActionState, useState, useTransition } from 'react';
import type { EnrolStart } from '@/lib/auth/mfa';
import { finishEnrolment, startEnrolment } from '../../actions';
import { Field, FormError, FormTitle, Submit } from '../../ui';
import { SignOutButton } from '../../sign-out-button';
import { QrCode } from './qr-code';

// First sign-in (US-03): MFA is mandatory, so the chat stays closed until an authenticator is set up.
export default function EnrolPage() {
  const [start, setStart] = useState<EnrolStart | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, action, pending] = useActionState(finishEnrolment, undefined);

  return (
    <div className="space-y-4">
      <FormTitle title="Set up your authenticator app">
        Every account needs an authenticator app, such as Google Authenticator or Microsoft Authenticator. You&apos;ll
        enter a code from it each time you sign in.
      </FormTitle>
      {!start?.ok ? (
        <>
          <FormError message={start && !start.ok ? start.error : null} />
          <button
            type="button"
            disabled={starting}
            onClick={() => startTransition(async () => setStart(await startEnrolment()))}
            className="btn btn-primary w-full"
          >
            {starting ? 'Please wait…' : 'Show the QR code'}
          </button>
        </>
      ) : (
        <form action={action} className="space-y-4">
          <QrCode qr={start.qr} secret={start.secret} />
          <input type="hidden" name="factorId" value={start.factorId} />
          <Field label="6-digit code from the app" name="code" className="input mt-1.5 text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
          <FormError message={state?.error} />
          <Submit pending={pending}>Finish setup</Submit>
        </form>
      )}
      <SignOutButton className="btn btn-ok w-full" />
    </div>
  );
}
