// Security headers (overview §10.0 secure by default, §10.6). The Content-Security-Policy is
// built per request in proxy.ts, because it carries a fresh nonce: only scripts and styles that
// Next.js marks with that nonce run, so injected markup can't run script even if it got onto a page.
// Everything else is fixed and set for every route in next.config.ts.

export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic': scripts loaded by a trusted (nonced) script are trusted too. React needs
    // eval in development only, for its error overlays.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // The development tools inject styles without the nonce; browsers ignore 'unsafe-inline'
    // when a nonce is present, so development drops the nonce instead. Production has no exception.
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    // data: for the authenticator QR code, which Supabase returns as an inline SVG image.
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// A fresh, unguessable value for each request.
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  // HTTPS only, for two years. The site is only ever served over HTTPS by Cloudflare.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Source links open KQ's site without telling it which conversation they came from.
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];
