// Fails the build if anything secret ended up in the files sent to browsers (overview §14.7):
// OpenAI keys, Supabase secret or service-role keys, or a JWT whose role is service_role.
// Runs after `opennextjs-cloudflare build`, on .open-next/assets (the public static files).
//   node scripts/scan-bundle.mjs [directory]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? '.open-next/assets';
const PATTERNS = [
  ['OpenAI key', /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['Cloudflare API token variable', /CLOUDFLARE_API_TOKEN/],
];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

let found = 0;
let scanned = 0;
for (const path of files(root)) {
  if (!/\.(js|mjs|css|html|json|txt|map)$/.test(path)) continue;
  scanned += 1;
  const text = readFileSync(path, 'utf8');
  for (const [label, pattern] of PATTERNS) {
    if (pattern.test(text)) {
      console.error(`${label} in ${path}`);
      found += 1;
    }
  }
  for (const match of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString());
      if (payload.role === 'service_role') {
        console.error(`service_role JWT in ${path}`);
        found += 1;
      }
    } catch {
      // Not a JWT payload.
    }
  }
}
if (scanned === 0) {
  console.error(`No files scanned in ${root}. Build first.`);
  process.exit(1);
}
if (found > 0) process.exit(1);
console.log(`No secrets in ${scanned} browser files.`);
