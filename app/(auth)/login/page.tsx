import { SignInForm } from './sign-in-form';

const NOTICES: Record<string, string> = {
  'confirm-failed': "That confirmation link didn't work or has expired. Sign up again with the same email to get a new one.",
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { notice } = await searchParams;
  return <SignInForm notice={typeof notice === 'string' ? NOTICES[notice] : undefined} />;
}
