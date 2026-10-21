import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// The link in the sign-up email (US-02). The email template sends the user here with a one-time
// token hash; checking it confirms the email address. Then they sign in and enrol MFA.
// The destination is fixed, so this can't be used as an open redirect.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  if (!tokenHash || (type !== 'email' && type !== 'signup')) redirect('/login?notice=confirm-failed');

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
  if (error) redirect('/login?notice=confirm-failed');
  // Confirming also signs the user in with a password-level session; proxy.ts takes them to enrolment.
  redirect('/mfa/enroll');
}
