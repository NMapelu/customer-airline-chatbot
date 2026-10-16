import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {};

// Lets `next dev` read Cloudflare bindings, including secrets from .dev.vars.
initOpenNextCloudflareForDev();

export default nextConfig;
