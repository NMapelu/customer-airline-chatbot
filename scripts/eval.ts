// Runs the evaluation set through the same pipeline as the chat (overview §13.1) and writes
// eval/report.md with pass rates, the §14 targets and a recommended similarity threshold.
//
//   npm run eval                          all questions, current threshold
//   npm run eval -- --category=uncovered  one or more categories (comma-separated)
//   npm run eval -- --threshold=0.45      try another threshold
//
// It signs in as the development test user from .dev.vars (see the README), so retrieval goes
// through RLS exactly as in the chat. Agent questions are skipped until agent mode (Phase 9).
// Full answers go to eval/results.jsonl, which git ignores: answers can quote KQ's text.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createOpenAI } from '@ai-sdk/openai';
import { sourcesFrom, streamAnswer } from '../lib/rag/answer';
import { CHAT_MODEL, CHECK_MODEL, EMBEDDING_MODEL, SIMILARITY_THRESHOLD, TOP_K } from '../lib/rag/config';
import { decide } from '../lib/rag/pipeline';
import type { Turn } from '../lib/rag/types';
import { judgeGrounded } from '../lib/eval/judge';
import { histogram, sweepThreshold, TARGETS, verdict, type Category, type EvalQuestion, type EvalResult } from '../lib/eval/score';
import { getServerEnv } from '../lib/env';
import { devUserClient } from '../lib/supabase/dev-user';
import sources from '../docs/sources.json';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const threshold = arg('threshold') ? Number(arg('threshold')) : SIMILARITY_THRESHOLD;
const onlyCategories = arg('category')?.split(',');
if (!Number.isFinite(threshold)) throw new Error('--threshold must be a number');

function fail(message: string): never {
  console.error(`\nEvaluation stopped: ${message}`);
  process.exit(1);
}

// Document titles in the database map back to slugs through sources.json and the staff files.
function titleToSlug(): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of sources as { slug: string; title: string }[]) map.set(s.title, s.slug);
  for (const file of ['asante-rewards-requests', 'baggage-irregularity-intake', 'call-handling-and-verification', 'complaints-and-goodwill', 'denied-boarding-and-overbooking', 'escalation-matrix', 'fare-rules-quick-reference', 'missed-connection-and-rebooking', 'refund-request-processing', 'special-assistance-and-medif']) {
    const title = readFileSync(`docs/staff/${file}.md`, 'utf8').match(/^title:\s*(.+)$/m)?.[1].trim();
    if (title) map.set(title, file);
  }
  return map;
}

async function pool<T, R>(items: T[], size: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i], i);
      }
    }),
  );
  return out;
}

// Text for a markdown table cell: escape backslashes first, then pipes, and keep it on one line.
const cell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

// The judge uses a stronger model than the one it checks; the first run with gpt-4o-mini judging
// itself failed correct answers for details they left out.
const JUDGE_MODEL = 'gpt-4o';

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

async function main() {
  if (!existsSync('.dev.vars')) fail('.dev.vars not found. Set up the test user first (see the README).');
  process.loadEnvFile('.dev.vars');
  const env = getServerEnv();
  const supabase = await devUserClient(env);
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = openai(CHAT_MODEL);
  const embeddingModel = openai.embedding(EMBEDDING_MODEL);
  const judge = openai(JUDGE_MODEL);
  const checkModel = openai(CHECK_MODEL);
  const slugs = titleToSlug();

  const questions = readFileSync('eval/questions.jsonl', 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as EvalQuestion)
    .filter((q) => !onlyCategories || onlyCategories.includes(q.category));
  console.log(`Running ${questions.length} questions at threshold ${threshold}...`);

  const results = await pool(questions, 4, async (q, i): Promise<EvalResult> => {
    const base = { id: q.id, category: q.category, topSimilarity: null, sourceSlugs: [], retrievedStaff: false, answer: null, grounded: null };
    if (q.audience === 'agent') return { ...base, kind: 'skipped', note: 'needs an agent user (Phase 9)' };
    try {
      const turns: Turn[] = [...(q.history ?? []), { role: 'user', text: q.question }];
      const decision = await decide({ model, checkModel, embeddingModel, supabase, role: 'customer', turns, threshold });
      if (decision.kind === 'refusal') return { ...base, kind: 'refusal' };
      const topSimilarity = Math.max(...decision.retrieved.map((c) => c.similarity), 0);
      const retrievedStaff = decision.retrieved.some((c) => c.audience === 'staff');
      const standalone = decision.standalone;
      if (decision.kind === 'escalation') return { ...base, kind: 'escalation', topSimilarity, retrievedStaff, standalone, note: decision.reason };

      const answer = await streamAnswer(model, 'customer', decision.chunks, turns).text;
      const judged = await judgeGrounded(judge, answer, decision.chunks);
      const sourceSlugs = sourcesFrom(decision.chunks).map((s) => slugs.get(s.title) ?? s.title);
      return {
        ...base,
        kind: 'answer',
        topSimilarity,
        retrievedStaff,
        sourceSlugs,
        standalone,
        answer,
        grounded: judged.grounded,
        note: judged.unsupported.length ? `unsupported: ${judged.unsupported.join('; ')}` : undefined,
      };
    } catch (error) {
      return { ...base, kind: 'error', note: error instanceof Error ? error.message : String(error) };
    } finally {
      if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${questions.length}`);
    }
  });

  writeFileSync('eval/results.jsonl', results.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync('eval/report.md', report(questions, results));
  console.log('\nWrote eval/report.md and eval/results.jsonl.');
  console.log(readFileSync('eval/report.md', 'utf8').split('\n## Failures')[0]);
}

function report(questions: EvalQuestion[], results: EvalResult[]): string {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const verdicts = results.map((r) => ({ r, q: byId.get(r.id)!, v: verdict(byId.get(r.id)!, r) }));
  const categories = [...new Set(questions.map((q) => q.category))] as Category[];

  const lines: string[] = [
    '# Evaluation report',
    '',
    `Run on ${new Date().toISOString().slice(0, 10)} with ${CHAT_MODEL} (checks on ${CHECK_MODEL}, judged by ${JUDGE_MODEL}), ${EMBEDDING_MODEL}, top ${TOP_K} passages and a similarity threshold of **${threshold}**.`,
    'Generated by `npm run eval` (overview §13.1). Targets are from overview §14.',
    '',
    '| Category | Passed | Rate | Target | Met |',
    '|----------|--------|------|--------|-----|',
  ];
  for (const c of categories) {
    const rows = verdicts.filter((x) => x.q.category === c);
    const scored = rows.filter((x) => x.v.pass !== null);
    if (scored.length === 0) {
      lines.push(`| ${c} | skipped (${rows.length}) | | ${TARGETS[c] !== undefined ? pct(TARGETS[c]!) : ''} | later phase |`);
      continue;
    }
    const passed = scored.filter((x) => x.v.pass).length;
    const rate = passed / scored.length;
    const target = TARGETS[c];
    lines.push(`| ${c} | ${passed}/${scored.length} | ${pct(rate)} | ${target !== undefined ? pct(target) : ''} | ${target === undefined ? '' : rate >= target ? 'yes' : '**no**'} |`);
  }

  const answers = results.filter((r) => r.kind === 'answer');
  const ungrounded = answers.filter((r) => r.grounded === false);
  const errors = results.filter((r) => r.kind === 'error');
  lines.push('', `Groundedness: ${answers.length - ungrounded.length}/${answers.length} answers judged grounded (target: no answer states a fee, limit or deadline that isn't in its passages).`);
  const escalations = results.filter((r) => r.kind === 'escalation');
  const notCovered = escalations.filter((r) => r.note === 'not_covered').length;
  lines.push('', `Escalations: ${escalations.length} (${escalations.length - notCovered} below the threshold, ${notCovered} by the coverage check).`);
  if (errors.length) lines.push('', `**${errors.length} questions failed with an error** (listed below).`);

  // Threshold: covered = answerable and follow-up questions; not covered = uncovered ones.
  // Only questions that passed the scope check have a similarity score.
  const points = results
    .filter((r) => r.topSimilarity !== null && ['answerable', 'follow_up', 'uncovered'].includes(r.category))
    .map((r) => ({ similarity: r.topSimilarity!, covered: r.category !== 'uncovered' }));
  const best = sweepThreshold(points);
  lines.push(
    '',
    '## Threshold',
    '',
    `Best separation by similarity alone: **${best.threshold}**. At that value ${pct(best.answered)} of covered questions pass the gate and ${pct(best.escalated)} of uncovered questions are escalated.`,
    'Ties go to the higher value, which escalates rather than answers (fail-safe). The coverage check runs after the threshold, so the configured value can sit lower than this and leave the close calls to it.',
    '',
    'Top similarity per question, by bucket (covered = answerable and follow-up; uncovered = not in the corpus):',
    '',
    '| From | Covered | Uncovered |',
    '|------|---------|-----------|',
  );
  const covered = histogram(points.filter((p) => p.covered).map((p) => p.similarity));
  const uncovered = histogram(points.filter((p) => !p.covered).map((p) => p.similarity));
  covered.forEach((b, i) => {
    if (b.count || uncovered[i].count) lines.push(`| ${b.from.toFixed(2)} | ${'█'.repeat(b.count)} ${b.count} | ${'█'.repeat(uncovered[i].count)} ${uncovered[i].count} |`);
  });

  const failures = verdicts.filter((x) => x.v.pass === false);
  lines.push('', '## Failures', '');
  if (failures.length === 0) lines.push('None.');
  else {
    lines.push('| ID | Question | Similarity | Reason |', '|----|----------|------------|--------|');
    for (const { q, r, v } of failures) {
      const sim = r.topSimilarity === null ? '' : r.topSimilarity.toFixed(3);
      lines.push(`| ${q.id} | ${cell(q.question)} | ${sim} | ${cell(v.reason)} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
