'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import {
  AdminError,
  cancelInvite,
  deactivateAgent,
  deletePassenger,
  inviteAgent,
  suspendPassenger,
} from '@/lib/admin/accounts';
import { codeSchema, emailSchema } from '@/lib/auth/schemas';
import { TOO_MANY, tooManyAttempts } from '@/lib/security/attempts';
import { audit } from '@/lib/security/audit';
import { requireAal2 } from '@/lib/supabase/server';

export type AdminState = { error?: string; needsCode?: boolean; done?: string } | undefined;

async function adminContext() {
  const context = await requireAal2();
  return context.user.app_metadata?.role === 'admin' ? context : null;
}

function failed(error: unknown): AdminState {
  if (error instanceof AdminError) return { error: error.message, needsCode: error.needsCode };
  console.error('admin action failed', error);
  return { error: 'Sorry, something went wrong. Please try again.' };
}

// A fresh code from the authenticator app unlocks changes for 5 minutes: the database checks the
// code's time in the session token for every change (public.require_admin).
export async function confirmCode(_prev: AdminState, form: FormData): Promise<AdminState> {
  const code = codeSchema.safeParse(form.get('code') ?? '');
  if (!code.success) return { error: 'Please enter the 6-digit code from your app.' };
  const context = await adminContext();
  if (!context) return { error: 'Only administrators can do this.' };
  const { supabase, user } = context;
  if (await tooManyAttempts(supabase, user.id)) return { error: TOO_MANY };
  const factors = await supabase.auth.mfa.listFactors();
  const current = factors.data?.totp.find((f) => f.status === 'verified');
  if (!current) return { error: 'Sorry, something went wrong. Please try again.' };
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: current.id, code: code.data });
  if (verified.error) {
    await audit(supabase, 'mfa_failed', await headers(), 'admin change');
    return { error: "That code didn't work. Check your app and try the newest code." };
  }
  revalidatePath('/admin', 'layout');
  return { done: 'Code accepted.' };
}

export async function inviteAgentAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  const email = emailSchema.safeParse(String(form.get('email') ?? '').trim());
  if (!email.success) return { error: 'Please enter a valid email address.' };
  const context = await adminContext();
  if (!context) return { error: 'Only administrators can do this.' };
  try {
    await inviteAgent(context.supabase, email.data);
  } catch (error) {
    return failed(error);
  }
  revalidatePath('/admin/agents');
  return { done: `Invited ${email.data.toLowerCase()}. Ask them to sign up within 7 days with this email.` };
}

const rowSchema = z.object({
  kind: z.enum(['cancel-invite', 'deactivate', 'suspend', 'restore', 'delete']),
  target: z.string().min(1).max(254),
});

// The buttons in the agent and passenger lists.
export async function rowAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  const parsed = rowSchema.safeParse({ kind: form.get('kind'), target: form.get('target') });
  if (!parsed.success) return { error: 'Please try again.' };
  const { kind, target } = parsed.data;
  const id = z.uuid().safeParse(target);
  if (kind !== 'cancel-invite' && !id.success) return { error: 'Please try again.' };
  const context = await adminContext();
  if (!context) return { error: 'Only administrators can do this.' };
  const { supabase } = context;
  try {
    if (kind === 'cancel-invite') await cancelInvite(supabase, target);
    else if (kind === 'deactivate') await deactivateAgent(supabase, target);
    else if (kind === 'delete') await deletePassenger(supabase, target);
    else await suspendPassenger(supabase, target, kind === 'suspend');
  } catch (error) {
    return failed(error);
  }
  revalidatePath('/admin', 'layout');
  const done = { 'cancel-invite': 'Invitation cancelled.', deactivate: 'Agent deactivated.', suspend: 'Account suspended.', restore: 'Account restored.', delete: 'Account deleted.' };
  return { done: done[kind] };
}
