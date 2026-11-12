import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { openedResetLink } from '@/lib/auth/access';
import { audit } from '@/lib/security/audit';
import { createClient } from '@/lib/supabase/server';

// Three kinds of link land here, and the destinations are fixed, so this can't be used as an open redirect.
//
// 1. Supabase's default sign-up email (US-02). Supabase confirms the email address when the link
//    is opened, then sends the user here with a one-time code. In the browser they signed up in,
//    the code becomes a password-level session and they go straight on to set up their
//    authenticator. In another browser the code can't be used (it is tied to the sign-up
//    browser), but the email is already confirmed, so they are asked to sign in.
// 2. An agent's setup link from `npm run invite-agent` (US-32), with a one-time token. Checking it
//    signs the agent in, and they go on to choose a password, then set up an authenticator.
// 3. A password reset email (app/(auth)/forgot-password). Like the sign-up link, it only works in
//    the browser that asked for it. The user then enters their authenticator code before they can
//    choose a new password (app/(auth)/new-password), so the email alone can't take over an account.
const AGENT_LINK_TYPES: EmailOtpType[] = ['invite', 'magiclink'];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  if (tokenHash && type && AGENT_LINK_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) redirect('/login?notice=invite-failed');
    await audit(supabase, 'email_confirmed', request.headers, `agent ${type} link`);
    redirect('/welcome');
  }

  const code = params.get('code');
  if (!code) redirect('/login?notice=confirm-failed');

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) redirect('/login?notice=confirmed');
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data && openedResetLink(data.currentAuthenticationMethods)) {
    await audit(supabase, 'email_confirmed', request.headers, 'password reset link');
    // proxy.ts sends anyone without an authenticator yet on to set one up first.
    redirect('/mfa/verify');
  }
  await audit(supabase, 'email_confirmed', request.headers);
  redirect('/mfa/enroll');
}
