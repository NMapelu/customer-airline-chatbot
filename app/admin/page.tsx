import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FEEDBACK_REASONS, type FeedbackReason } from '@/lib/chat/feedback';
import { getInsights } from '@/lib/admin/insights';
import { requireAal2 } from '@/lib/supabase/server';
import { AnswerText } from '../(chat)/answer-text';

export const metadata: Metadata = { title: 'Insights · KQ Policy Assistant', robots: { index: false, follow: false } };

const percent = (part: number, whole: number) => (whole === 0 ? '–' : `${Math.round((part / whole) * 100)}%`);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const reasonLabel = (reason: string | null) =>
  reason && Object.hasOwn(FEEDBACK_REASONS, reason) ? FEEDBACK_REASONS[reason as FeedbackReason] : 'No reason given';

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
  const box = 'rounded border border-gray-300 p-4';

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <Link href="/" className="text-sm text-blue-700 underline">
        Back to the chat
      </Link>
      <h1 className="text-2xl font-semibold">Insights</h1>
      <p className="text-sm text-gray-600">
        Last 30 days unless marked. Questions are shown as users typed them, with personal details masked. This visit is
        recorded in the audit log.
      </p>

      <section className="grid gap-4 sm:grid-cols-4" aria-label="Replies">
        <div className={box}>
          <p className="text-sm text-gray-600">Questions</p>
          <p className="text-2xl font-semibold">{daily.reduce((n, d) => n + d.questions, 0)}</p>
        </div>
        <div className={box}>
          <p className="text-sm text-gray-600">Answered</p>
          <p className="text-2xl font-semibold">{percent(answers, replies)}</p>
        </div>
        <div className={box}>
          <p className="text-sm text-gray-600">Escalated</p>
          <p className="text-2xl font-semibold">{percent(escalations, replies)}</p>
        </div>
        <div className={box}>
          <p className="text-sm text-gray-600">Refused (off topic)</p>
          <p className="text-2xl font-semibold">{percent(refusals, replies)}</p>
        </div>
      </section>

      <section className={box}>
        <h2 className="font-semibold">Questions per day</h2>
        {daily.length === 0 ? (
          <p className="text-sm">No questions yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {daily.map((d) => (
              <li key={d.day} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-gray-600">{shortDate(d.day)}</span>
                {/* A native bar: inline styles are blocked by the Content-Security-Policy. */}
                <progress className="h-3 flex-1 accent-blue-600" value={d.questions} max={busiest} aria-hidden="true" />
                <span>{d.questions}</span>
              </li>
            ))}
          </ul>
        )}
        {monthly.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Earlier, per month</h3>
            <ul className="text-sm">
              {monthly.map((m) => (
                <li key={m.month}>
                  {m.month}: {m.questions}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={box}>
        <h2 className="font-semibold">Knowledge gaps</h2>
        <p className="text-sm text-gray-600">Escalated questions, grouped when they share most of their words. Add policies for the top ones.</p>
        {gaps.length === 0 ? (
          <p className="mt-2 text-sm">No escalations.</p>
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {gaps.map((g) => (
              <li key={g.example}>
                {g.example} <span className="text-gray-600">({g.count}×)</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={box}>
        <h2 className="font-semibold">Most-cited documents</h2>
        {topics.length === 0 ? (
          <p className="mt-2 text-sm">No answers yet.</p>
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {topics.map((t) => (
              <li key={t.title}>
                {t.title} <span className="text-gray-600">({t.answers} answers)</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={box}>
        <h2 className="font-semibold">Feedback</h2>
        <p className="text-sm">
          Helpful: {percent(feedback.up, feedback.up + feedback.down)} of {feedback.up + feedback.down} ratings.
        </p>
        <h3 className="mt-3 text-sm font-semibold">Latest thumbs-down</h3>
        {feedback.latest_down.length === 0 ? (
          <p className="text-sm">None.</p>
        ) : (
          <ul className="mt-1 space-y-3 text-sm">
            {feedback.latest_down.map((f, i) => (
              <li key={i} className="border-t border-gray-300 pt-2">
                <p className="text-gray-600">
                  {shortDate(f.at)}: {reasonLabel(f.reason)}
                </p>
                {f.question && <p className="font-semibold">{f.question}</p>}
                <AnswerText text={f.answer} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
