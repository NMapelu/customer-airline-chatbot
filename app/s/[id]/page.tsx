import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { getSharedAnswer } from '@/lib/chat/shares';
import { getServerEnv } from '@/lib/env';
import { DISCLAIMER } from '@/lib/legal';
import { AnswerText } from '../../(chat)/answer-text';

// Shared links are private by intent: keep them out of search engines.
export const metadata: Metadata = { title: 'Shared answer · KQ Policy Assistant', robots: { index: false, follow: false } };

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
    <main className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Shared answer</h1>
      {!shared ? (
        <p>This link has expired or was turned off by the person who shared it.</p>
      ) : (
        <>
          <p className="text-sm text-gray-600">Answered on {longDate(shared.answeredAt)}. Policies change, so check the sources for the latest rules.</p>
          {shared.question && (
            <div className="whitespace-pre-wrap rounded-lg bg-blue-500 px-4 py-2 text-white">{shared.question}</div>
          )}
          <div className="rounded-lg bg-gray-200 px-4 py-2 text-black">
            <AnswerText text={shared.answer} />
            {shared.sources.length > 0 && (
              <div className="mt-2 border-t border-gray-300 pt-2 text-xs text-gray-700">
                <p className="font-semibold">Sources</p>
                <ul className="mt-1 space-y-1">
                  {shared.sources.map((s, i) => {
                    const label = s.section ? `${s.title}: ${s.section}` : s.title;
                    return (
                      <li key={i}>
                        {s.url?.startsWith('https://') ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
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
      <p className="text-xs text-gray-500">{DISCLAIMER}</p>
      <Link href="/" className="text-sm text-blue-700 underline">
        Ask your own question
      </Link>
    </main>
  );
}
