'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { newTotpFactor, type EnrolStart } from '@/lib/auth/mfa';
import { codeSchema, factorIdSchema, newPasswordSchema, signInSchema, signUpSchema } from '@/lib/auth/schemas';
import { HOME } from '@/lib/auth/access';
import { PRIVACY_VERSION } from '@/lib/legal';
import { TOO_MANY, tooManyAttempts } from '@/lib/security/attempts';
import { audit } from '@/lib/security/audit';
import { hashKey } from '@/lib/security/rate-limit';
import { getAuthState } from '@/lib/supabase/auth-state';
import { cameFromSetupLink, createClient } from '@/lib/supabase/server';

// Sign-up, sign-in and MFA (overview §10.1, US-02 to US-04). Each action runs on the server with
// the anon key; Supabase Auth checks the password and codes and sets the HTTP-only session cookies.
// Error messages stay generic, so they don't reveal whether an account exists.

// `email` goes back to the form after an error: React clears a form once its action finishes.
export type FormState = { error?: string; done?: boolean; email?: string } | undefined;

async function currentUserId(supabase: SupabaseClient): Promise<string | undefined> {
  return (await supabase.auth.getUser()).data.user?.id;
}

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const email = field(form, 'email').trim();
  const parsed = signUpSchema.safeParse({
    email,
    password: field(form, 'password'),
    confirm: field(form, 'confirm'),
    consent: field(form, 'consent') === 'on',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.path[0] === 'consent') return { error: 'Please agree to the privacy notice to create an account.', email };
    if (issue.path[0] === 'email') return { error: 'Please enter a valid email address.', email };
    if (issue.path[0] === 'confirm') return { error: "The two passwords don't match.", email };
    return { error: 'Please choose a stronger password (see the rule under the field).', email };
  }

  // The confirmation link comes back to this site. Supabase only sends it to an allow-listed
  // URL (Auth → URL Configuration); anything else falls back to the Site URL.
  const origin = (await headers()).get('origin');
  const supabase = await createClient();
  if (await tooManyAttempts(supabase)) return { error: TOO_MANY, email };
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: origin && URL.canParse(origin) ? `${new URL(origin).origin}/auth/confirm` : undefined,
      // The record of consent (overview §11): which notice, and when.
      data: { privacy_consent: { version: PRIVACY_VERSION, at: new Date().toISOString() } },
    },
  });
  if (error) {
    if (error.code === 'weak_password') return { error: 'Please choose a stronger password.', email };
    console.error('sign-up failed', error.code, error.message);
    return { error: "We couldn't create the account. Please try again later.", email };
  }
  await audit(supabase, 'sign_up', await headers());
  // The same message whether or not the email was already registered.
  return { done: true };
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = field(form, 'email').trim();
  const parsed = signInSchema.safeParse({ email, password: field(form, 'password') });
  if (!parsed.success) return { error: 'Please enter your email and password.', email };

  const supabase = await createClient();
  if (await tooManyAttempts(supabase, parsed.data.email)) return { error: TOO_MANY, email };
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // The account as a hash, so repeated attempts on one account show up without storing the address.
    await audit(supabase, 'sign_in_failed', await headers(), `account ${(await hashKey(parsed.data.email)).slice(0, 12)}`);
    // Only reachable with the right password, so it doesn't help anyone guess.
    if (error.code === 'email_not_confirmed') return { error: 'Please confirm your email first, using the link we sent you.', email };
    return { error: 'The email or password is incorrect.', email };
  }
  await audit(supabase, 'sign_in', await headers());
  // Password only (AAL1): on to enrolment (first sign-in) or the code.
  const { status } = await getAuthState(supabase);
  redirect(status === 'error' ? '/login' : HOME[status]);
}

// An invited agent chooses a password (US-32). Only for a session that came from the setup link
// and has no authenticator yet: a stolen password-level session can't use this to change the password.
export async function choosePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({
    password: field(form, 'password'),
    confirm: field(form, 'confirm'),
  });
  if (!parsed.success) {
    return parsed.error.issues[0].path[0] === 'confirm'
      ? { error: "The two passwords don't match." }
      : { error: 'Please choose a stronger password (see the rule under the field).' };
  }
  const supabase = await createClient();
  if (!(await cameFromSetupLink(supabase))) redirect('/');
  if (await tooManyAttempts(supabase, await currentUserId(supabase))) return { error: TOO_MANY };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === 'weak_password' || error.code === 'same_password') return { error: 'Please choose a stronger password.' };
    console.error('choosing a password failed', error.code, error.message);
    return { error: "We couldn't save the password. Please try again." };
  }
  redirect('/mfa/enroll');
}

// Step 1 of enrolment (US-03): a new authenticator secret, shown as a QR code and a key.
// Only for a signed-in user who has no verified authenticator yet; replacing one goes through
// settings and needs a code from the current one.
export async function startEnrolment(): Promise<EnrolStart> {
  const supabase = await createClient();
  const { status } = await getAuthState(supabase);
  if (status !== 'needs_enrol') return { ok: false, error: 'Please sign in again.' };
  return newTotpFactor(supabase);
}

// Step 2 of enrolment: the first code proves the app was set up, and the session becomes AAL2.
export async function finishEnrolment(_prev: FormState, form: FormData): Promise<FormState> {
  const factorId = factorIdSchema.safeParse(field(form, 'factorId'));
  const code = codeSchema.safeParse(field(form, 'code'));
  if (!factorId.success) return { error: 'Please start again.' };
  if (!code.success) return { error: 'Please enter the 6-digit code from your app.' };

  const supabase = await createClient();
  if (await tooManyAttempts(supabase, await currentUserId(supabase))) return { error: TOO_MANY };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factorId.data, code: code.data });
  if (error) {
    await audit(supabase, 'mfa_failed', await headers(), 'enrolment');
    return { error: "That code didn't work. Check your app and try the newest code." };
  }
  await audit(supabase, 'mfa_enrolled', await headers());
  redirect('/');
}

// Every later sign-in (US-04): the code from the enrolled authenticator.
export async function verifyCode(_prev: FormState, form: FormData): Promise<FormState> {
  const code = codeSchema.safeParse(field(form, 'code'));
  if (!code.success) return { error: 'Please enter the 6-digit code from your app.' };

  const supabase = await createClient();
  const factors = await supabase.auth.mfa.listFactors();
  const factor = factors.data?.totp.find((f) => f.status === 'verified');
  if (!factor) redirect('/');
  if (await tooManyAttempts(supabase, factor.id)) return { error: TOO_MANY };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.data });
  if (error) {
    await audit(supabase, 'mfa_failed', await headers(), 'sign-in');
    return { error: "That code didn't work. Check your app and try the newest code." };
  }
  await audit(supabase, 'mfa_verified', await headers());
  redirect('/');
}

// US-14. Ends this browser's session only; other devices stay signed in.
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // For an agent, the database stops serving staff content to this session's token at once
  // (a no-op for customers). Signing out goes ahead even if this fails.
  const ended = await supabase.rpc('end_agent_session');
  if (ended.error) console.error('could not end the agent session', ended.error.message);
  await audit(supabase, 'sign_out', await headers());
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/login');
}
