import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { AdminError, findPassengers, type Passenger } from '@/lib/admin/accounts';
import { AdminTabs } from '../admin-tabs';
import { CodeBox, RowButton } from '../admin-ui';
import { codeFreshUntil, day, requireAdmin, when } from '../admin';

export const metadata: Metadata = { title: 'Passenger accounts · KQ Chatbot', robots: { index: false, follow: false } };

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });

// Passenger accounts, for abuse or a deletion request. Accounts are only found by searching for an
// email, never listed in full, and conversations are never shown (overview §7.13 privacy).
export default async function PassengersPage({ searchParams }: PageProps<'/admin/passengers'>) {
  const { supabase } = await requireAdmin();
  const { q } = await searchParams;
  const search = typeof q === 'string' ? q.trim().slice(0, 254) : '';
  const fresh = await codeFreshUntil(supabase);

  let results: Passenger[] | null = null;
  let error: string | null = null;
  if (search) {
    try {
      results = await findPassengers(supabase, search);
    } catch (e) {
      error = e instanceof AdminError ? e.message : 'Sorry, something went wrong. Please try again.';
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        <PageHeader
          title="Passenger accounts"
          description="Find an account by email to suspend, restore or delete it. Conversations are never shown here. Every search and change is recorded in the audit log."
        />
        <AdminTabs current="/admin/passengers" />
        <CodeBox until={fresh ? clock(fresh) : null} />

        <section className="card space-y-3 p-5">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="block min-w-56 flex-1 text-sm">
              <span className="font-medium">Email, or part of it (at least 3 characters)</span>
              <input className="input mt-1.5" type="search" name="q" defaultValue={search} minLength={3} maxLength={254} required />
            </label>
            <button type="submit" className="btn btn-primary">
              Search
            </button>
          </form>
          {error && (
            <p role="alert" className="notice notice-error">
              {error}
            </p>
          )}
          {results && results.length === 0 && <p className="text-sm text-muted">No passenger account matches.</p>}
          {results && results.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Joined</th>
                    <th className="py-2 pr-3 font-medium">Last sign-in</th>
                    <th className="py-2 pr-3 font-medium">Conversations</th>
                    <th className="py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {results.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-3 break-all">
                        {p.email} {p.suspended && <span className="badge badge-brand">Suspended</span>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{day(p.created_at)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{when(p.last_sign_in_at)}</td>
                      <td className="py-2 pr-3">{p.conversations}</td>
                      <td className="py-2">
                        <div className="flex justify-end gap-2">
                          {p.suspended ? (
                            <RowButton kind="restore" target={p.id} label="Restore" />
                          ) : (
                            <RowButton kind="suspend" target={p.id} label="Suspend" />
                          )}
                          <RowButton kind="delete" target={p.id} label="Delete" confirm="Confirm: delete for good" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted">
            Suspending signs the person out everywhere and blocks sign-in until you restore the account. Deleting removes the account
            and all its conversations and can&apos;t be undone. Agent and administrator accounts aren&apos;t listed here.
          </p>
        </section>
      </div>
    </div>
  );
}
