// Creates a call-centre agent account (US-32, US-38) and prints its one-time setup link.
//
//   npm run invite-agent -- name@example.com
//   npm run invite-agent -- --test-user        the agent test user for `npm run eval`
//
// The agent opens the link, chooses a password and sets up an authenticator app; their role is
// already 'agent', so they see agent mode from the first sign-in. Send the link through a channel
// you trust (for example their work email): whoever opens it first can set up the account.
// The link expires after Supabase's email link lifetime (Authentication → Providers → Email →
// Email OTP Expiration; the README suggests 86400 seconds, the longest Supabase allows).
// Running it again for an agent who hasn't finished setting up prints a fresh link.
import { existsSync } from 'node:fs';
import { createTestAgent, inviteAgent } from '../lib/admin/agents';
import { adminClient, emailArgument, fail } from './admin-client';

async function main() {
  if (process.argv.includes('--test-user')) {
    if (!existsSync('.dev.vars')) fail('.dev.vars not found.');
    process.loadEnvFile('.dev.vars');
    const email = process.env.DEV_AGENT_EMAIL?.trim();
    const password = process.env.DEV_AGENT_PASSWORD;
    if (!email || !password) fail('set DEV_AGENT_EMAIL and DEV_AGENT_PASSWORD in .dev.vars first.');
    const { admin } = adminClient(false);
    const result = await createTestAgent(admin, email, password);
    console.log(`Agent test user ${result === 'created' ? 'created' : 'already exists'}: ${email}. Now run npm run dev-user -- --agent.`);
    return;
  }

  const email = emailArgument('npm run invite-agent -- name@example.com');
  const { admin, site } = adminClient(true);
  const result = await inviteAgent(admin, email, site);
  console.log(result.kind === 'invited' ? `\nAgent account created for ${email}.` : `\n${email} hasn't finished setting up. Here is a new link.`);
  console.log('\nSend this one-time link to the agent through a channel you trust:\n');
  console.log(`  ${result.link}\n`);
  console.log('It works once, and expires after the Email OTP Expiration set in Supabase.');
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
