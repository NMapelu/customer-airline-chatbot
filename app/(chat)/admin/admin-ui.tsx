'use client';

import { useActionState, useState } from 'react';
import { Field, FormError } from '../../(auth)/ui';
import { confirmCode, inviteAgentAction, rowAction, type AdminState } from './actions';

function Done({ state }: { state: AdminState }) {
  if (!state?.done) return null;
  return (
    <p role="status" className="notice notice-ok">
      {state.done}
    </p>
  );
}

// Changes need a code from the authenticator app entered in the last 5 minutes.
export function CodeBox({ until }: { until: string | null }) {
  const [state, action, pending] = useActionState(confirmCode, undefined);
  if (until) {
    return (
      <p className="notice notice-ok">
        Changes are unlocked until {until}. After that, enter a new code to make more changes.
      </p>
    );
  }
  return (
    <form action={action} className="card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-48 flex-1">
        <Field label="To make changes, enter a code from your authenticator app" name="code" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? 'Please wait…' : 'Unlock for 5 minutes'}
      </button>
      <div className="w-full empty:hidden">
        <FormError message={state?.error} />
      </div>
    </form>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteAgentAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Field label="Work email of the new agent" name="email" type="email" autoComplete="off" maxLength={254} required />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Please wait…' : 'Invite agent'}
        </button>
      </div>
      <FormError message={state?.error} />
      <Done state={state} />
    </form>
  );
}

type Kind = 'cancel-invite' | 'deactivate' | 'suspend' | 'restore' | 'delete';

// A button for one row. Actions that can't easily be undone ask for a second click.
export function RowButton({ kind, target, label, confirm }: { kind: Kind; target: string; label: string; confirm?: string }) {
  const [state, action, pending] = useActionState(rowAction, undefined);
  const [armed, setArmed] = useState(false);
  const danger = kind === 'delete' || kind === 'deactivate';
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirm && !armed) {
          event.preventDefault();
          setArmed(true);
        }
      }}
      className="inline-flex flex-col items-end gap-1"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-outline'}`}>
        {pending ? 'Please wait…' : armed ? confirm : label}
      </button>
      {state?.error && (
        <span role="alert" className="max-w-56 text-right text-xs text-brand">
          {state.error}
        </span>
      )}
    </form>
  );
}
