import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getServerEnv, type ServerEnv } from './env';
import type { Role } from './rag/types';
import { getAuthState } from './supabase/auth-state';
import { createClient } from './supabase/server';

export type ChatSession = { env: ServerEnv; supabase: SupabaseClient; user: User; role: Role };

// Who is asking (overview §8.2 step 3), from the session cookies. Returns null unless the user has
// signed in with a password and an authenticator code (AAL2), and the route answers 401.
// proxy.ts already checked this; the route checks again so it never relies on that alone (§10.1).
export async function getChatSession(): Promise<ChatSession | null> {
  const env = getServerEnv();
  const supabase = await createClient();
  const { status, user, role } = await getAuthState(supabase);
  if (status === 'error') throw new Error('the session could not be checked');
  if (status !== 'aal2' || !user) return null;
  return { env, supabase, user, role };
}
