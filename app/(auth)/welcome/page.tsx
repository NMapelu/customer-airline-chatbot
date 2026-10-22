import { redirect } from 'next/navigation';
import { cameFromSetupLink, createClient } from '@/lib/supabase/server';
import { ChoosePasswordForm } from './choose-password-form';

// Where an invited agent lands from their setup link (US-32): choose a password, then set up an
// authenticator. Anyone else is sent on (proxy.ts already limits this page to accounts without one).
export default async function WelcomePage() {
  if (!(await cameFromSetupLink(await createClient()))) redirect('/mfa/enroll');
  return <ChoosePasswordForm />;
}
