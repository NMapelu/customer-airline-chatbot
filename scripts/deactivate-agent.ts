// Deactivates a call-centre agent who has left (US-38): removes the agent role and bans the
// account, which signs them out everywhere. Their conversations are kept.
//
//   npm run deactivate-agent -- name@example.com
import { deactivateAgent } from '../lib/admin/agents';
import { adminClient, emailArgument, fail } from './admin-client';

async function main() {
  const email = emailArgument('npm run deactivate-agent -- name@example.com');
  const { admin } = adminClient(false);
  await deactivateAgent(admin, email);
  console.log(`\n${email} is deactivated: signed out everywhere and can no longer sign in or see staff content.`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
