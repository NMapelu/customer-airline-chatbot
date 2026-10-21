import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Where the link in Supabase's default sign-up email lands (US-02). Supabase confirms the email
// address when the link is opened, then sends the user here with a one-time code. In the browser
// they signed up in, the code becomes a password-level session and they go straight on to set
// up their authenticator. In another browser the code can't be used (it is tied to the sign-up
// browser), but the email is already confirmed, so they are asked to sign in.
// The destinations are fixed, so this can't be used as an open redirect.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) redirect('/login?notice=confirm-failed');

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) redirect('/login?notice=confirmed');
  redirect('/mfa/enroll');
}
