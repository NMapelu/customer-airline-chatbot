import { AGENT_IDLE_MINUTES } from '@/lib/auth/access';
import { SignInForm } from './sign-in-form';

const NOTICES: Record<string, string> = {
  confirmed:
    'That link was opened in a different browser. If you were confirming your email, it is confirmed: sign in to continue. If you were resetting your password, ask for a new link from this browser.',
  'confirm-failed':
    "That link didn't work or has expired. To confirm your email, sign up again with the same email. To reset your password, ask for a new link.",
  'password-changed': 'Your password has been changed. Sign in with the new one.',
  'invite-failed': "That setup link didn't work or has expired. Ask your administrator for a new one.",
  'account-deleted': 'Your account and conversations have been deleted.',
  'agent-timeout': `For security, agent sessions end after ${AGENT_IDLE_MINUTES} minutes without activity. Please sign in again.`,
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { notice } = await searchParams;
  return <SignInForm notice={typeof notice === 'string' ? NOTICES[notice] : undefined} />;
}
