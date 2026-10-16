import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Every page is rendered per request, so no incremental cache is configured.
export default defineCloudflareConfig({});
