import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { FEEDBACK_REASONS, type FeedbackReason } from '@/lib/chat/feedback';
import { getInsights } from '@/lib/admin/insights';
import { requireAal2 } from '@/lib/supabase/server';
import { AnswerText } from '../answer-text';

export const metadata: Metadata = { title: 'Insights · KQ Chatbot', robots: { index: false, follow: false } };

const percent = (part: number, whole: number) => (whole === 0 ? '–' : `${Math.round((part / whole) * 100)}%`);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const reasonLabel = (reason: string | null) =>
  reason && Object.hasOwn(FEEDBACK_REASONS, reason) ? FEEDBACK_REASONS[reason as FeedbackReason] : 'No reason given';

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'brand' }) {
  return (
    <div className={`card p-4 ${tone === 'brand' ? 'card-brand' : 'card-ok'}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tracking-tight ${tone === 'brand' ? 'text-brand' : ''}`}>{value}</p>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// The administrator's insights dashboard (overview §7.13, US-21). Admins only: anyone else gets a
// 404, and the database refuses them too. Each visit is written to the audit log by the database.
// It shows no user emails or ids, and only monthly totals for anything older than 30 days.
export default async function AdminPage() {
  const { supabase, user } = await requireAal2();
  if (user.app_metadata?.role !== 'admin') notFound();
  const insights = await getInsights(supabase);
  if (!insights) notFound();

  const { daily, monthly, kinds, topics, gaps, feedback } = insights;
  const answers = kinds.answer ?? 0;
  const escalations = kinds.escalation ?? 0;
  const refusals = kinds.refusal ?? 0;
  const replies = answers + escalations + refusals;
  const busiest = Math.max(1, ...daily.map((d) => d.questions));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
      <PageHeader
        title="Insights"
        description="Last 30 days unless marked. Questions are shown as users typed them, with personal details masked. This visit is recorded in the audit log."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Replies">
        <Stat label="Questions" value={daily.reduce((n, d) => n + d.questions, 0)} />
        <Stat label="Answered" value={percent(answers, replies)} />
        <Stat label="Escalated" value={percent(escalations, replies)} tone="brand" />
        <Stat label="Refused (off topic)" value={percent(refusals, replies)} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Questions per day">
        {daily.length === 0 ? (
          <p className="text-sm text-muted">No questions yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {daily.map((d) => (
              <li key={d.day} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-muted">{shortDate(d.day)}</span>
                {/* A native bar: inline styles are blocked by the Content-Security-Policy. */}
                <progress className="h-2.5 flex-1 accent-[#15803d]" value={d.questions} max={busiest} aria-hidden="true" />
                <span>{d.questions}</span>
              </li>
            ))}
          </ul>
        )}
        {monthly.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Earlier, per month</h3>
            <ul className="text-sm text-muted">
              {monthly.map((m) => (
                <li key={m.month}>
                  {m.month}: {m.questions}
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel title="Knowledge gaps" description="Escalated questions, grouped when they share most of their words. Add information for the top ones.">
        {gaps.length === 0 ? (
          <p className="text-sm text-muted">No escalations.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {gaps.map((g) => (
              <li key={g.example} className="flex items-start justify-between gap-3">
                <span>{g.example}</span>
                <span className="badge badge-brand shrink-0">{g.count}×</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      </div>

      <Panel title="Most-cited documents">
        {topics.length === 0 ? (
          <p className="text-sm text-muted">No answers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Document</th>
                  <th className="py-2 text-right font-semibold">Answers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {topics.map((t) => (
                  <tr key={t.title}>
                    <td className="py-2 pr-3">{t.title}</td>
                    <td className="py-2 text-right">
                      <span className="badge badge-ok">{t.answers}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Feedback" description={`Helpful: ${percent(feedback.up, feedback.up + feedback.down)} of ${feedback.up + feedback.down} ratings.`}>
        <h3 className="text-sm font-semibold">Latest thumbs-down</h3>
        {feedback.latest_down.length === 0 ? (
          <p className="text-sm text-muted">None.</p>
        ) : (
          <ul className="mt-2 space-y-3 text-sm">
            {feedback.latest_down.map((f, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <p className="text-xs text-muted">
                  {shortDate(f.at)}: {reasonLabel(f.reason)}
                </p>
                {f.question && <p className="font-semibold">{f.question}</p>}
                <AnswerText text={f.answer} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      </div>
    </div>
  );
}
