import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerEnv, type ServerEnv } from './env';
import type { Role } from './rag/types';
import { devUserClient } from './supabase/dev-user';

export type ChatSession = { env: ServerEnv; supabase: SupabaseClient; role: Role };

// Who is asking (overview §8.2 step 3). Returns null when there is no MFA-verified session,
// and the route answers 401.
// Phase 6: only `npm run dev` has a session, through the temporary test user. Production builds
// always get null, so the deployed chat is closed until Phase 8 adds real sign-in (fail-safe).
export async function getChatSession(): Promise<ChatSession | null> {
  if (process.env.NODE_ENV !== 'development') return null;
  const env = getServerEnv();
  const supabase = await devUserClient(env);

  // Check the assurance level again on the server, whatever produced the session.
  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || aal?.currentLevel !== 'aal2') return null;

  // The role comes from app_metadata, which users can't edit. Anything else means customer.
  const { data: user } = await supabase.auth.getUser();
  const role: Role = user.user?.app_metadata?.role === 'agent' ? 'agent' : 'customer';
  return { env, supabase, role };
}
