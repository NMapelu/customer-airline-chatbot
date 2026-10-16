import { NextResponse } from 'next/server';

// Phase 2 check that proxy.ts runs on Cloudflare Workers.
// Phase 8 replaces this with the session and MFA (AAL2) checks.
export function proxy() {
  const response = NextResponse.next();
  response.headers.set('x-proxy', 'ok');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
