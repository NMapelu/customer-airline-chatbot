import type { SupabaseClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { audit } from './audit';
import { clientIp } from './client-ip';
import { hashKey, withinLimit } from './rate-limit';

export const TOO_MANY = 'Too many attempts. Please wait a minute and try again.';

// Rate limits on everything that checks a password or a code (overview §10.8): per IP address, and
// per account where there is one, so guessing is slow from one address or against one account.
// `account` is a user id, an authenticator id or an email address (hashed before it leaves the Worker).
export async function tooManyAttempts(supabase: SupabaseClient, account?: string): Promise<boolean> {
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  const ok =
    (await withinLimit('AUTH_IP_LIMITER', ip)) && (!account || (await withinLimit('AUTH_ACCOUNT_LIMITER', await hashKey(account))));
  if (!ok) await audit(supabase, 'rate_limited', requestHeaders, 'auth');
  return !ok;
}
