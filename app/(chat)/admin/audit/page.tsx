import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { AdminError, AUDIT_EVENTS, auditEvent, auditRange, readAuditLog, type AuditRow } from '@/lib/admin/accounts';
import { AdminTabs } from '../admin-tabs';
import { requireAdmin, when } from '../admin';

export const metadata: Metadata = { title: 'Audit log · KQ Chatbot', robots: { index: false, follow: false } };

const SHOWN = 200;

// The security log (overview §10.10): sign-ins, failed codes, account and role changes, admin visits.
// Emails are masked, and reading the log is itself recorded. Entries are kept for 12 months.
export default async function AuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const { from, to } = auditRange(params.from, params.to);
  const event = auditEvent(params.event);

  let rows: AuditRow[] = [];
  let error: string | null = null;
  try {
    rows = await readAuditLog(supabase, from, to, event, SHOWN);
  } catch (e) {
    error = e instanceof AdminError ? e.message : 'Sorry, something went wrong. Please try again.';
  }
  const download = `/admin/audit/download?${new URLSearchParams({ from, to, ...(event ? { event } : {}) })}`;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        <PageHeader
          title="Audit log"
          description="Security events from the last 12 months, newest first. Emails are masked. Reading or downloading the log is recorded too."
        />
        <AdminTabs current="/admin/audit" />

        <section className="card space-y-4 p-5">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="font-medium">From</span>
              <input className="input mt-1.5" type="date" name="from" defaultValue={from} required />
            </label>
            <label className="block text-sm">
              <span className="font-medium">To</span>
              <input className="input mt-1.5" type="date" name="to" defaultValue={to} required />
            </label>
            <label className="block min-w-48 flex-1 text-sm">
              <span className="font-medium">Event</span>
              <select className="input mt-1.5" name="event" defaultValue={event ?? ''}>
                <option value="">All events</option>
                {Object.entries(AUDIT_EVENTS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary">
              Show
            </button>
            <a href={download} className="btn btn-outline" download>
              Download CSV
            </a>
          </form>

          {error ? (
            <p role="alert" className="notice notice-error">
              {error}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted">No events in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Time</th>
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">IP address</th>
                    <th className="py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 whitespace-nowrap">{when(r.at)}</td>
                      <td className="py-2 pr-3">{AUDIT_EVENTS[r.event] ?? r.event}</td>
                      <td className="py-2 pr-3 break-all">
                        {r.account ?? <span className="text-muted">None</span>}
                        {r.role && r.role !== 'customer' && <span className="badge badge-muted ml-1">{r.role}</span>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{r.ip ?? ''}</td>
                      <td className="py-2 text-muted">{r.detail ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length === SHOWN && (
            <p className="text-xs text-muted">Showing the newest {SHOWN}. Download the CSV for up to 5,000, or choose a shorter period.</p>
          )}
        </section>
      </div>
    </div>
  );
}
