import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cameFromResetLink, createClient } from '@/lib/supabase/server';
import { PasswordForm } from '../password-form';

export const metadata: Metadata = { title: 'New password · KQ Chatbot' };

// The last step of a password reset. Only for a session that opened the reset link in the last
// 15 minutes and then entered its authenticator code; everyone else goes to the chat.
export default async function NewPasswordPage() {
  if (!(await cameFromResetLink(await createClient()))) redirect('/');
  return <PasswordForm purpose="reset" />;
}
