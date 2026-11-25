import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { listAgents } from '@/lib/admin/accounts';
import { AdminTabs } from '../admin-tabs';
import { CodeBox, InviteForm, RowButton } from '../admin-ui';
import { codeFreshUntil, day, requireAdmin, when } from '../admin';

export const metadata: Metadata = { title: 'Agents · KQ Chatbot', robots: { index: false, follow: false } };

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });

// Call-centre agents (US-32, US-38): who has access to internal procedures, invitations nobody has
// used yet, and deactivation. An invited person signs up on the normal sign-up page with that email.
export default async function AgentsPage() {
  const { supabase } = await requireAdmin();
  const [{ agents, invites }, fresh] = await Promise.all([listAgents(supabase), codeFreshUntil(supabase)]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        <PageHeader title="Agents" description="Call-centre agents can see internal procedures. Every change here is recorded in the audit log." />
        <AdminTabs current="/admin/agents" />
        <CodeBox until={fresh ? clock(fresh) : null} />

        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">Invite an agent</h2>
          <p className="text-sm text-muted">
            The person then signs up on the normal sign-up page with this email within 7 days, and their account is an agent account
            from the start. An email that already has a passenger account can&apos;t become an agent: use their work email.
          </p>
          <InviteForm />
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">
            Agents <span className="badge badge-muted">{agents.length}</span>
          </h2>
          {agents.length === 0 ? (
            <p className="text-sm text-muted">No agents yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Joined</th>
                    <th className="py-2 pr-3 font-medium">Last sign-in</th>
                    <th className="py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {agents.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 pr-3 break-all">
                        {a.email} {!a.set_up && <span className="badge badge-muted">Not set up yet</span>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{day(a.created_at)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{when(a.last_sign_in_at)}</td>
                      <td className="py-2 text-right">
                        <RowButton kind="deactivate" target={a.id} label="Deactivate" confirm="Confirm: deactivate" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted">
            Deactivating signs the agent out everywhere and blocks the account. Their conversations are kept.
          </p>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">
            Waiting to sign up <span className="badge badge-muted">{invites.length}</span>
          </h2>
          {invites.length === 0 ? (
            <p className="text-sm text-muted">No open invitations.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {invites.map((i) => (
                <li key={i.email} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="break-all">
                    {i.email} <span className="text-muted">· expires {day(i.expires_at)}</span>
                  </span>
                  <RowButton kind="cancel-invite" target={i.email} label="Cancel" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
