import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import { STATIC_SECURITY_HEADERS } from './lib/security/headers';

const nextConfig: NextConfig = {
  // Don't advertise the framework.
  poweredByHeader: false,
  // The Content-Security-Policy is added per request in proxy.ts (it needs a nonce).
  async headers() {
    return [{ source: '/:path*', headers: STATIC_SECURITY_HEADERS }];
  },
};

// Lets `next dev` read Cloudflare bindings, including secrets from .dev.vars.
initOpenNextCloudflareForDev({ remoteBindings: !process.env.CI });

export default nextConfig;
