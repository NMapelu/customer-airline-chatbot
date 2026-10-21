# KQ Policy Assistant

> **Disclaimer:** this is an independent academic project. It is not an official Kenya Airways service and is not affiliated with or endorsed by Kenya Airways.

A secure web chatbot that answers Kenya Airways policy questions (baggage, refunds, check-in, special assistance and more) using retrieval-augmented generation (RAG). It serves two audiences:

- **Customers** get answers grounded only in KQ's public policies, with a source link on every answer.
- **Call-centre agents** get an agent mode that also searches internal handling procedures.

Questions outside the policies are refused or handed off to KQ customer service, never guessed.

## Tech stack

Next.js 16 · React 19 · Tailwind CSS 4 · Vercel AI SDK · OpenAI (GPT-4o-mini, text-embedding-3-small) · Supabase (Auth with TOTP MFA, Postgres, pgvector, Row Level Security) · Cloudflare Workers · GitHub Actions

## Getting started

Requirements: Node.js 22 LTS and an OpenAI API key.

```bash
git clone https://github.com/NMapelu/customer-airline-chatbot.git
cd customer-airline-chatbot
npm ci
cp .dev.vars.example .dev.vars   # then fill in the values
npm run dev                      # http://localhost:3000
```

Server secrets live in `.dev.vars` locally and in Cloudflare secrets (`npx wrangler secret put <NAME>`) when deployed. Don't put them in `.env` files: the Cloudflare build copies `.env*` values into the Worker bundle, so `npm run preview` and `npm run deploy` refuse to run if they find any. Chat requests fail with a clear server log message if a required secret is missing.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run build` | Production build |
| `npm run preview` | Build for Cloudflare and run the Worker locally |
| `npm run deploy` | Build and deploy to Cloudflare Workers |
| `npm run check-env` | Fail if any `.env*` file holds a secret that would be bundled |
| `npm run fetch-corpus` | Download the KQ pages in `docs/sources.json` into `docs/public/` (not committed) |
| `npm run check-corpus` | Check the front matter of every knowledge-base document |
| `npm run ingest` | Load the knowledge base into Supabase (needs `.env.ingest`) |
| `npm run dev-user` | Set up the temporary development test user (see below) |
| `npm run eval` | Run the evaluation set and write `eval/report.md` (see below) |
| `npm test` | Run the unit tests (Node's built-in test runner) |
| `npm run test:integration` | Run the integration tests against a local Supabase stack (CI runs them) |

## Database

The schema lives in `supabase/migrations/` and is applied with the Supabase CLI (installed as a dev dependency). Every table has Row Level Security, and every policy requires an MFA-verified session. `supabase/tests/rls.test.sql` proves that users can't read each other's chats and customers can't read staff documents. CI runs these tests on every pull request.

Local commands (need Docker Desktop running):

```bash
npx supabase start       # local Supabase stack
npx supabase db reset    # re-apply all migrations from scratch
npx supabase test db     # run the RLS tests
npx supabase stop
```

To apply migrations to the hosted project: `npx supabase login`, `npx supabase link --project-ref <ref>`, then `npx supabase db push`.

## Knowledge base

- `docs/sources.json` lists the 16 Kenya Airways pages the chatbot answers from. Their text is **fetched at ingest time and never committed**, because this repo is public. Fetched pages land in `docs/public/`, which git ignores, and from there go only into the private Supabase database.
- `docs/staff/` holds 10 sample call-centre procedures written for this project. They are marked `illustrative: true` and are **not real Kenya Airways documents**. They describe how an agent applies the public policies, and don't add fees or limits of their own.
- `npm run ingest` loads the knowledge base into Supabase. It fetches the KQ pages, runs the check, splits each document into chunks, embeds new or changed documents with OpenAI, and replaces each one's chunks in a single transaction. A second run with nothing changed reports everything as unchanged. Add `-- --dry-run` to see the plan without embedding anything, or `-- --skip-fetch` to reuse the pages already in `docs/public/`. It needs a `.env.ingest` file (copy `.env.ingest.example`). The Supabase service-role key lives only there, never in `.env.local`, `.dev.vars` or Cloudflare.
- `npm run check-corpus` checks every document's front matter (audience, sources, dates). A document with a missing or wrong audience fails, so it can never be shown to the wrong users.

## How the chat answers

`app/api/chat/route.ts` runs each question through the modules in `lib/rag/`:

1. Check the user has an MFA-verified session and read their role from `app_metadata`.
2. Mask anything that looks like a card, passport, phone number or booking reference (`pii.ts`).
3. Refuse messages that aren't about Kenya Airways policy (`scope.ts`), judging the user's own words. If the check fails, the question is refused.
4. Turn a follow-up into a standalone question for the search (`rewrite.ts`).
5. Search the knowledge base with the user's own session, so RLS decides what they can see (`retrieve.ts`).
6. If no passage is similar enough, or a model check finds the passages don't actually answer the question, reply with the KQ contact details instead of generating an answer (`gate.ts`, `coverage.ts`, `contact.ts`). A staff passage reaching a customer is blocked the same way.
7. Answer only from the passages and show their sources under the answer (`prompts.ts`, `answer.ts`).

The similarity threshold in `lib/rag/config.ts` is chosen from the evaluation results. It only drops clearly unrelated passages; the coverage check makes the close calls, because questions the corpus doesn't cover can still score high similarity.

### Evaluation

`eval/questions.jsonl` holds 216 test questions in the categories of overview §13.1: answerable, not covered, off-topic, prompt injection, follow-ups, staff-content leakage, and agent questions (skipped until agent mode in Phase 9). `npm run eval` sends each one through the same pipeline as the chat, signed in as the development test user, so retrieval goes through RLS. An LLM judge checks that every answer's facts are in its passages.

It writes `eval/report.md` with pass rates against the §14 targets, the failures, and the similarity threshold that best separates covered from uncovered questions. Full answers go to `eval/results.jsonl`, which git ignores because answers can quote KQ's pages. A full run makes about 700 OpenAI calls, mostly on gpt-4o; estimated from token counts, that is roughly 4 US dollars of credit. Add `-- --category=uncovered` to run some categories only, or `-- --threshold=0.5` to try another threshold.

### Temporary development test user

Real sign-in arrives in Phase 8. Until then the chat works only under `npm run dev`, signed in as one test user with a real MFA-verified session, so it goes through the same RLS as a real user. Every production build (`npm run preview`, `npm run deploy`) answers 401.

1. In the Supabase dashboard, open **Authentication → Users → Add user → Create new user**. Use an email you control, a strong password, and tick **Auto Confirm User**.
2. In `.dev.vars`, fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DEV_USER_EMAIL` and `DEV_USER_PASSWORD` (see `.dev.vars.example`).
3. Run `npm run dev-user`. It enrols an authenticator for that user and saves its secret to `.dev.vars` as `DEV_USER_TOTP_SECRET`.
4. Run `npm run dev` and ask a question.

These values stay in `.dev.vars` only. Never set them as Cloudflare secrets. Phase 8 removes the test user.

## Project management

Work is tracked on the GitHub project board. There is one milestone per build phase, and every change is linked to an issue and merged through a pull request with green CI.

## Security

Security principles, the threat model and scan results live in [`docs/security/`](docs/security/). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Authorship

The project is owned and directed by Neema Mapelu. Parts of the code are written with the AI assistant Claude, and those commits are marked `Co-Authored-By: Claude`. Every change is reviewed and merged by the owner.
