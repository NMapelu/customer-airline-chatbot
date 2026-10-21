import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { HOME } from '../auth/access';
import { getServerEnv } from '../env';
import type { Role } from '../rag/types';
import { COOKIE_OPTIONS, getAuthState } from './auth-state';

// A Supabase client for Server Components, Server Actions and Route Handlers, acting as the
// signed-in user with the anon key, so every query runs under RLS. Create one per request.
export async function createClient(): Promise<SupabaseClient> {
  // Reading cookies first also marks every page that uses this as dynamic (never prerendered).
  const store = await cookies();
  const env = getServerEnv();
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components can't set cookies. proxy.ts refreshes the session before they run.
        }
      },
    },
  });
}

// For pages and Server Actions that need a fully signed-in user. proxy.ts has already redirected
// everyone else; this repeats the check on the server so a page never relies on proxy.ts alone.
export async function requireAal2(): Promise<{ supabase: SupabaseClient; user: User; role: Role }> {
  const supabase = await createClient();
  const { status, user, role } = await getAuthState(supabase);
  if (status === 'error') throw new Error('the session could not be checked');
  if (status !== 'aal2' || !user) redirect(HOME[status]);
  return { supabase, user, role };
}
