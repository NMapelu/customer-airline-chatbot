// Gives an existing passenger account the administrator role, which opens the insights dashboard
// (/admin, overview §7.13), or takes it away. The account keeps chatting as a passenger.
//
//   npm run set-admin -- name@example.com
//   npm run set-admin -- name@example.com --remove
//
// The user must sign in again (with their authenticator code) before /admin opens.
import { setAdmin } from '../lib/admin/agents';
import { adminClient, emailArgument, fail } from './admin-client';

async function main() {
  const email = emailArgument('npm run set-admin -- name@example.com [--remove]');
  const remove = process.argv.includes('--remove');
  const { admin } = adminClient(false);
  await setAdmin(admin, email, !remove);
  console.log(remove ? `\n${email} is no longer an administrator.` : `\n${email} is now an administrator. They need to sign in again to open /admin.`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
