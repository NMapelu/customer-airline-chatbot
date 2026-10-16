// OpenNext copies every value in these files into the deployed Worker bundle.
// Server secrets must live in Cloudflare secrets (deployed) or .dev.vars (local) instead,
// so building for Cloudflare stops if any of these files holds a non-public value.
import { existsSync, readFileSync } from 'node:fs';

const bundledEnvFiles = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.test.local',
];

const problems = [];
for (const file of bundledEnvFiles) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!key.startsWith('NEXT_PUBLIC_') && value.trim() !== '') problems.push(`${file}: ${key}`);
  }
}

if (problems.length > 0) {
  console.error('Refusing to build for Cloudflare: these values would be baked into the Worker bundle.');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('Move them to .dev.vars (local) and `npx wrangler secret put <NAME>` (deployed), then try again.');
  process.exit(1);
}
