import { getCloudflareContext } from '@opennextjs/cloudflare';

// Rate limits (overview §10.8), using Cloudflare's rate limiting bindings in wrangler.jsonc.
// Each limiter counts requests per key over a short window, across the whole Worker.
// Fail-safe (§10.0): if a limiter is missing or fails, the request is refused, never let through.
//
// CHAT_USER_LIMITER   20 chat messages a minute per user
// CHAT_IP_LIMITER     60 chat messages a minute per IP address (a call centre shares one)
// AUTH_IP_LIMITER     30 sign-in, sign-up and code attempts a minute per IP address (a call
//                     centre signing in at the start of a shift shares one)
// AUTH_ACCOUNT_LIMITER 5 sign-in or code attempts a minute per account
export type LimiterName = 'CHAT_USER_LIMITER' | 'CHAT_IP_LIMITER' | 'AUTH_IP_LIMITER' | 'AUTH_ACCOUNT_LIMITER';

type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

export async function withinLimit(name: LimiterName, key: string): Promise<boolean> {
  let limiter: unknown;
  try {
    limiter = (getCloudflareContext().env as unknown as Record<string, unknown>)[name];
  } catch (error) {
    console.error('could not read the Cloudflare bindings', error);
  }
  return checkLimit(name, limiter, key);
}

// Separate from the bindings so the fail-safe behaviour is unit-tested.
export async function checkLimit(name: string, limiter: unknown, key: string): Promise<boolean> {
  if (!limiter || typeof (limiter as Limiter).limit !== 'function') {
    console.error(`rate limiter ${name} is not configured, refusing the request`);
    return false;
  }
  try {
    return (await (limiter as Limiter).limit({ key })).success === true;
  } catch (error) {
    console.error(`rate limiter ${name} failed, refusing the request`, error);
    return false;
  }
}

// Keys never hold an email address in the clear: Cloudflare only needs to tell accounts apart.
export async function hashKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}
