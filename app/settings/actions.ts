'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { newTotpFactor, type EnrolStart } from '@/lib/auth/mfa';
import { codeSchema, factorIdSchema } from '@/lib/auth/schemas';
import { TOO_MANY, tooManyAttempts } from '@/lib/security/attempts';
import { audit } from '@/lib/security/audit';
import { requireAal2 } from '@/lib/supabase/server';

// Replacing the authenticator, for example on a new phone (US-13, overview §10.1).
// Step 1 needs a code from the current app before a new one can be set up. Step 2 checks a code
// from the new app and only then removes the old one, so MFA is never switched off on the way.

export async function startReplacement(currentCode: string): Promise<EnrolStart> {
  const code = codeSchema.safeParse(currentCode);
  if (!code.success) return { ok: false, error: 'Please enter the 6-digit code from your current app.' };

  const { supabase, user } = await requireAal2();
  if (await tooManyAttempts(supabase, user.id)) return { ok: false, error: TOO_MANY };
  const factors = await supabase.auth.mfa.listFactors();
  const current = factors.data?.totp.find((f) => f.status === 'verified');
  if (!current) return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: current.id, code: code.data });
  if (error) {
    await audit(supabase, 'mfa_failed', await headers(), 'replacement');
    return { ok: false, error: "That code didn't work. Check your current app and try the newest code." };
  }
  return newTotpFactor(supabase);
}

export type ReplaceState = { error?: string; done?: boolean } | undefined;

export async function finishReplacement(_prev: ReplaceState, form: FormData): Promise<ReplaceState> {
  const newId = factorIdSchema.safeParse(form.get('factorId'));
  const newCode = codeSchema.safeParse(form.get('newCode') ?? '');
  if (!newId.success) return { error: 'Please start again.' };
  if (!newCode.success) return { error: 'Please enter the 6-digit code from your new app.' };

  const { supabase, user } = await requireAal2();
  if (await tooManyAttempts(supabase, user.id)) return { error: TOO_MANY };
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) return { error: 'Sorry, something went wrong. Please try again.' };
  // Only a factor set up in step 1 (still unverified) can replace the current one.
  if (!factors.data.all.some((f) => f.id === newId.data && f.factor_type === 'totp' && f.status === 'unverified')) {
    return { error: 'Please start again.' };
  }
  const added = await supabase.auth.mfa.challengeAndVerify({ factorId: newId.data, code: newCode.data });
  if (added.error) return { error: "That code didn't work. Check your new app and try the newest code." };

  for (const old of factors.data.totp.filter((f) => f.status === 'verified')) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: old.id });
    if (error) {
      console.error('could not remove the old authenticator', error.code, error.message);
      return { error: 'The new app works, but the old one could not be removed. Please try again.' };
    }
  }
  await audit(supabase, 'mfa_replaced', await headers());
  return { done: true };
}

// Account deletion (overview §11, user control). A fresh code from the authenticator app first:
// a session left open on someone else's computer isn't enough to delete the account. The
// database checks the same thing again (public.delete_my_account). Agent accounts are removed by
// the administrator, so their conversations stay available to the airline (US-38).
export type DeleteState = { error?: string } | undefined;

export async function deleteAccount(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  if (form.get('confirm') !== 'on') return { error: 'Please tick the box to confirm.' };
  const code = codeSchema.safeParse(form.get('code') ?? '');
  if (!code.success) return { error: 'Please enter the 6-digit code from your app.' };

  const { supabase, user, role } = await requireAal2();
  if (role === 'agent') return { error: 'Agent accounts are removed by your administrator.' };
  if (await tooManyAttempts(supabase, user.id)) return { error: TOO_MANY };
  const factors = await supabase.auth.mfa.listFactors();
  const current = factors.data?.totp.find((f) => f.status === 'verified');
  if (!current) return { error: 'Sorry, something went wrong. Please try again.' };
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: current.id, code: code.data });
  if (verified.error) {
    await audit(supabase, 'mfa_failed', await headers(), 'account deletion');
    return { error: "That code didn't work. Check your app and try the newest code." };
  }
  // Uses the session the code just refreshed, which carries the new code's time.
  const { error } = await supabase.rpc('delete_my_account');
  if (error) {
    console.error('account deletion failed', error.code, error.message);
    return { error: "We couldn't delete the account. Please try again." };
  }
  // The account is gone, so this only clears the cookies.
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/login?notice=account-deleted');
}
