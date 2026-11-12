import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { Brand } from '@/components/brand';
import { getSharedAnswer } from '@/lib/chat/shares';
import { getServerEnv } from '@/lib/env';
import { AnswerText } from '../../(chat)/answer-text';

// Shared links are private by intent: keep them out of search engines.
export const metadata: Metadata = { title: 'Shared answer · KQ Chatbot', robots: { index: false, follow: false } };

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// A shared answer (overview §7.15). Public: anyone with the link can read it without signing in.
// Read with the anon key and no session, through public.get_shared_answer, which returns only the
// question, the answer and its sources, and only while the link is live.
export default async function SharedAnswerPage({ params }: PageProps<'/s/[id]'>) {
  const { id } = await params;
  const env = getServerEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const shared = await getSharedAnswer(supabase, id);

  return (
    <>
    <header className="sidebar px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <Brand />
      </div>
    </header>
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Shared answer</h1>
      {!shared ? (
        <p className="card p-4">This link has expired or was turned off by the person who shared it.</p>
      ) : (
        <>
          <p className="text-sm text-muted">Answered on {longDate(shared.answeredAt)}. Rules change, so check the sources for the latest.</p>
          {shared.question && (
            <div className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#c8102e] px-4 py-2.5 text-white">
                {shared.question}
              </div>
            </div>
          )}
          <div className="card px-4 py-3">
            <AnswerText text={shared.answer} />
            {shared.sources.length > 0 && (
              <div className="mt-3 rounded-lg border border-line p-3 text-xs text-muted">
                <p className="font-semibold text-foreground">Sources</p>
                <ul className="mt-1 space-y-1">
                  {shared.sources.map((s, i) => {
                    const label = s.section ? `${s.title}: ${s.section}` : s.title;
                    return (
                      <li key={i}>
                        {s.url?.startsWith('https://') ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="link">
                            {label}
                          </a>
                        ) : (
                          label
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
      <Link href="/" className="btn btn-primary">
        Ask your own question
      </Link>
    </main>
    </>
  );
}
