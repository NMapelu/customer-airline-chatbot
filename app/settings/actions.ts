'use server';

import { newTotpFactor, type EnrolStart } from '@/lib/auth/mfa';
import { codeSchema, factorIdSchema } from '@/lib/auth/schemas';
import { requireAal2 } from '@/lib/supabase/server';

// Replacing the authenticator, for example on a new phone (US-13, overview §10.1).
// Step 1 needs a code from the current app before a new one can be set up. Step 2 checks a code
// from the new app and only then removes the old one, so MFA is never switched off on the way.

export async function startReplacement(currentCode: string): Promise<EnrolStart> {
  const code = codeSchema.safeParse(currentCode);
  if (!code.success) return { ok: false, error: 'Please enter the 6-digit code from your current app.' };

  const { supabase } = await requireAal2();
  const factors = await supabase.auth.mfa.listFactors();
  const current = factors.data?.totp.find((f) => f.status === 'verified');
  if (!current) return { ok: false, error: 'Sorry, something went wrong. Please try again.' };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: current.id, code: code.data });
  if (error) return { ok: false, error: "That code didn't work. Check your current app and try the newest code." };
  return newTotpFactor(supabase);
}

export type ReplaceState = { error?: string; done?: boolean } | undefined;

export async function finishReplacement(_prev: ReplaceState, form: FormData): Promise<ReplaceState> {
  const newId = factorIdSchema.safeParse(form.get('factorId'));
  const newCode = codeSchema.safeParse(form.get('newCode') ?? '');
  if (!newId.success) return { error: 'Please start again.' };
  if (!newCode.success) return { error: 'Please enter the 6-digit code from your new app.' };

  const { supabase } = await requireAal2();
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
  return { done: true };
}
