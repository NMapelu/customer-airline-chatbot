import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { accessFor } from './lib/auth/access';
import { getServerEnv } from './lib/env';
import { audit } from './lib/security/audit';
import { contentSecurityPolicy, newNonce } from './lib/security/headers';
import { COOKIE_OPTIONS, getAuthState } from './lib/supabase/auth-state';

// Runs before every page and API route (overview §10.1, defense in depth "Routing").
// It refreshes the session cookies, works out how far the user has signed in, and applies the
// rules in lib/auth/access.ts: no session → /login, password only → /mfa/enroll or /mfa/verify,
// AAL2 → through. The API gets 401 instead of a redirect. Any error denies.
// Pages and /api/chat check again on their own; this is the first layer, not the only one.
// It also sets the Content-Security-Policy with a fresh nonce (overview §10.6). Next.js reads the
// policy from the request headers and puts the nonce on its own scripts and styles.
export async function proxy(request: NextRequest) {
  const csp = contentSecurityPolicy(newNonce(), process.env.NODE_ENV === 'development');
  // Rebuilt after a cookie refresh, so the page sees both the new cookies and the policy.
  const forward = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('content-security-policy', csp);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };
  let response = forward();
  const headers: Record<string, string> = {};

  let status;
  let agentTimedOut = false;
  let supabase;
  try {
    const env = getServerEnv();
    supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list, cacheHeaders) {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = forward();
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
          Object.assign(headers, cacheHeaders);
        },
      },
    });
    ({ status, agentTimedOut = false } = await getAuthState(supabase));
  } catch (error) {
    console.error('proxy session check failed', error);
    status = 'error' as const;
  }

  const access = accessFor(request.nextUrl.pathname, status);
  let result: NextResponse;
  if (access.action === 'allow') {
    result = response;
  } else if (access.action === 'redirect') {
    const to = agentTimedOut && access.to === '/login' ? '/login?notice=agent-timeout' : access.to;
    result = NextResponse.redirect(new URL(to, request.url), 303);
  } else {
    // A password-only session trying the API (overview §10.10): someone without the code.
    if (supabase && access.status === 401 && (status === 'needs_verify' || status === 'needs_enrol')) {
      await audit(supabase, 'aal1_rejected', request.headers, request.nextUrl.pathname.slice(0, 100));
    }
    const message =
      access.status === 401 ? 'Please sign in to use the chat.' : 'The service is not available right now. Please try again shortly.';
    result = request.nextUrl.pathname.startsWith('/api/')
      ? NextResponse.json({ error: message }, { status: access.status })
      : new NextResponse(message, { status: access.status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  // Keep any refreshed session cookies, and stop shared caches from storing a response that sets them.
  if (result !== response) for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
  for (const [name, value] of Object.entries(headers)) result.headers.set(name, value);
  result.headers.set('content-security-policy', csp);
  return result;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
