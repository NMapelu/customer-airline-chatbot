import { AGENT_IDLE_MINUTES } from '@/lib/auth/access';
import { SignInForm } from './sign-in-form';

const NOTICES: Record<string, string> = {
  confirmed: 'Your email is confirmed. Sign in to set up your authenticator app.',
  'confirm-failed': "That confirmation link didn't work or has expired. Sign up again with the same email to get a new one.",
  'invite-failed': "That setup link didn't work or has expired. Ask your administrator for a new one.",
  'agent-timeout': `For security, agent sessions end after ${AGENT_IDLE_MINUTES} minutes without activity. Please sign in again.`,
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { notice } = await searchParams;
  return <SignInForm notice={typeof notice === 'string' ? NOTICES[notice] : undefined} />;
}
