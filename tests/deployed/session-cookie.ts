// Signs the customer test user in and hands its session cookie to the next CI steps (the ZAP
// authenticated scan and the red-team suite) as SESSION_COOKIE. The value is masked in the logs.
//   npx tsx tests/deployed/session-cookie.ts
import { appendFileSync } from 'node:fs';
import { signIn, testUser } from './session';

async function main() {
  const user = testUser('TEST_CUSTOMER');
  if (!user) throw new Error('Set the TEST_CUSTOMER_* variables.');
  const { cookie } = await signIn(user);
  const target = process.env.GITHUB_ENV;
  if (!target) {
    process.stdout.write(`${cookie}\n`);
    return;
  }
  for (const part of cookie.split('; ')) console.log(`::add-mask::${part.slice(part.indexOf('=') + 1)}`);
  appendFileSync(target, `SESSION_COOKIE=${cookie}\n`);
  console.log('SESSION_COOKIE set for the next steps.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
