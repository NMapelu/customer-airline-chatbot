# KQ Policy Assistant

> **Disclaimer:** this is an independent academic project. It is not an official Kenya Airways service and is not affiliated with or endorsed by Kenya Airways.

A secure web chatbot that answers Kenya Airways policy questions (baggage, refunds, check-in, special assistance and more) using retrieval-augmented generation (RAG). It serves two audiences:

- **Customers** get answers grounded only in KQ's public policies, with a source link on every answer.
- **Call-centre agents** get an agent mode that also searches internal handling procedures.

Questions outside the policies are refused or handed off to KQ customer service, never guessed.

## Architecture

```
Browser ──HTTPS──▶ Cloudflare Worker (Next.js via OpenNext)
                     │  proxy.ts: session + MFA (AAL2) check, CSP nonce
                     │  /api/chat: rate limit → PII mask → scope check → retrieval → confidence gate
                     │             → staff-content guard → answer from passages only → sources
                     ├──▶ Supabase (Auth with TOTP, Postgres + pgvector, Row Level Security)
                     └──▶ OpenAI (GPT-4o, text-embedding-3-small; no tools, no internet)
```

The Worker holds only the Supabase anon key and acts as the signed-in user, so the database's RLS decides what each person can read. The knowledge base is loaded by an admin script (`npm run ingest`), the only place the service-role key is used.

## Tech stack

Next.js 16 · React 19 · Tailwind CSS 4 · Vercel AI SDK · OpenAI (GPT-4o, text-embedding-3-small) · Supabase (Auth with TOTP MFA, Postgres, pgvector, Row Level Security) · Cloudflare Workers · GitHub Actions

## Getting started

Requirements: Node.js 22 LTS and an OpenAI API key.

```bash
git clone https://github.com/NMapelu/customer-airline-chatbot.git
cd customer-airline-chatbot
npm ci
cp .dev.vars.example .dev.vars   # then fill in the values
npm run dev                      # http://localhost:3000
```

Server secrets live in `.dev.vars` locally and in Cloudflare secrets when deployed. Don't put them in `.env` files: the Cloudflare build copies `.env*` values into the Worker bundle, so `npm run preview` and `npm run deploy` refuse to run if they find any.

### Secrets for the deployed site

The deployed Worker needs these three Cloudflare secrets. Set each one once; each command asks for the value, which you paste into the terminal, never into a file or a chat:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put SUPABASE_URL        # exactly https://<ref>.supabase.co, nothing after it, no quotes
npx wrangler secret put SUPABASE_ANON_KEY   # the anon / publishable key, never the service-role key
```

`npx wrangler secret list` shows which are set (names only). Changes take effect without a redeploy. If one is missing or malformed, every page shows "The service is not available right now"; `npx wrangler tail` then shows which one in the server log ("Invalid server environment"). If OpenAI rejects the key or the account has no credit left, the chat says it can't answer right now, and the log shows OpenAI's reason.

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
| `npm run invite-agent -- <email>` | Create a call-centre agent account and print its one-time setup link (needs `.env.ingest`) |
| `npm run deactivate-agent -- <email>` | Deactivate an agent: signs them out everywhere and blocks the account (needs `.env.ingest`) |
| `npm run set-admin -- <email> [--remove]` | Give a passenger account the administrator role for `/admin`, or take it away (needs `.env.ingest`) |
| `npm run dev-user` | Set up the test user that `npm run eval` signs in as (see below) |
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

To apply migrations to the hosted project: `npx supabase login`, `npx supabase link --project-ref <ref>`, then `npx supabase db push`. Run `db push` after pulling a change that adds a file to `supabase/migrations/`, before deploying the code that needs it.

## Knowledge base

- `docs/sources.json` lists the 16 Kenya Airways pages the chatbot answers from. Their text is **fetched at ingest time and never committed**, because this repo is public. Fetched pages land in `docs/public/`, which git ignores, and from there go only into the private Supabase database.
- `docs/staff/` holds 10 sample call-centre procedures written for this project. They are marked `illustrative: true` and are **not real Kenya Airways documents**. They describe how an agent applies the public policies, and don't add fees or limits of their own.
- `npm run ingest` loads the knowledge base into Supabase. It fetches the KQ pages, runs the check, splits each document into chunks, embeds new or changed documents with OpenAI, and replaces each one's chunks in a single transaction. A second run with nothing changed reports everything as unchanged. Add `-- --dry-run` to see the plan without embedding anything, or `-- --skip-fetch` to reuse the pages already in `docs/public/`. It needs a `.env.ingest` file (copy `.env.ingest.example`). The Supabase service-role key lives only there, never in `.env.local`, `.dev.vars` or Cloudflare.
- `npm run check-corpus` checks every document's front matter (audience, sources, dates). A document with a missing or wrong audience fails, so it can never be shown to the wrong users.

## How the chat answers

`app/api/chat/route.ts` runs each question through the modules in `lib/rag/`:

1. Check the user has an MFA-verified session and read their role from `app_metadata`.
2. Mask anything that looks like a card, passport, phone number or booking reference (`pii.ts`), then save the question to the conversation and read the earlier turns from the database (`lib/chat/history.ts`). The browser sends only the conversation id and the new question.
3. Refuse messages that aren't about Kenya Airways policy (`scope.ts`), judging the user's own words. If OpenAI can't be reached for this or any other check, nothing is answered and the chat says it can't answer right now.
4. Turn a follow-up into a standalone question for the search (`rewrite.ts`).
5. Search the knowledge base twice, with the question and with it restated in the airline's policy wording, and take passages from each in turn, so the reworded search adds passages without pushing out what the question itself found. Both searches use the user's own session, so RLS decides what they can see (`retrieve.ts`, `rewrite.ts`).
6. If no passage is similar enough, or a model check finds the passages don't actually answer the question, reply with the KQ contact details instead of generating an answer (`gate.ts`, `coverage.ts`, `contact.ts`). A staff passage reaching a customer is blocked the same way.
7. Answer only from the passages and show their sources under the answer (`prompts.ts`, `answer.ts`). The answer and its sources are saved once it has finished; a failed answer is not saved.
8. For agents, also write the **Customer-ready wording** in a separate call that only ever receives public passages (`wording.ts`), and save it with the answer.

The similarity threshold in `lib/rag/config.ts` is chosen from the evaluation results. It only drops clearly unrelated passages; the coverage check makes the close calls, because questions the corpus doesn't cover can still score high similarity.

### Evaluation

`eval/questions.jsonl` holds 216 test questions in the categories of overview §13.1: answerable, not covered, off-topic, prompt injection, follow-ups, staff-content leakage, and agent questions. `npm run eval` sends each one through the same pipeline as the chat, signed in as the customer or agent test user (see below), so retrieval goes through RLS. Without an agent test user, the agent questions are skipped. An LLM judge checks that every answer's facts are in its passages.

It writes `eval/report.md` with pass rates against the §14 targets, the failures, and the similarity threshold that best separates covered from uncovered questions. Full answers go to `eval/results.jsonl`, which git ignores because answers can quote KQ's pages. A full run makes about 700 OpenAI calls, mostly on gpt-4o; estimated from token counts, that is roughly 4 US dollars of credit. Add `-- --category=uncovered` to run some categories only, or `-- --threshold=0.5` to try another threshold.

## Accounts and sign-in

Everyone signs up with an email and password, confirms the email, and must set up an authenticator app (TOTP) before the chat opens. Every later sign-in asks for a code from the app. A session counts as signed in only at AAL2 (password and code):

- `proxy.ts` runs before every page and API route. No session goes to `/login`; a password without a code goes to `/mfa/enroll` or `/mfa/verify`; `/api/chat` answers 401. If the check itself fails, the request is refused.
- Pages, Server Actions and `/api/chat` check AAL2 again on the server, and every RLS policy requires it too.
- Session cookies are HTTP-only, SameSite=Lax and Secure (except under `npm run dev`). The browser never talks to Supabase directly; all auth calls go through Server Actions.
- MFA can't be turned off. In **Settings**, users can replace their authenticator after entering a code from the current one.
- **Lost authenticator (manual recovery):** after checking the person's identity, the project owner deletes their authenticator in the Supabase dashboard (**Authentication → Users → the user → Multi-factor authentication**). At their next sign-in they set up a new one.

Conversations are saved and listed in the sidebar, newest first. Users can open, rename and delete them; deleting is permanent. Questions are saved with personal details masked.

### Setting up sign-in on the hosted Supabase project

Do this once in the Supabase dashboard:

1. **Authentication → Sign In / Providers → Email**: enabled, with **Confirm email** on.
2. Optional, as a second layer: if your dashboard shows password settings (usually inside the **Email** provider panel from step 1), set the minimum length to **12** and require **lowercase, uppercase letters and digits**. The sign-up form already enforces this rule on the server.
3. **Authentication → Multi-Factor**: **TOTP (App Authenticator)** enabled.
4. **Authentication → URL Configuration**: set **Site URL** to `https://kq-policy-assistant.neema-mapelu.workers.dev`, and add these **Redirect URLs**:
   - `https://kq-policy-assistant.neema-mapelu.workers.dev/auth/confirm`
   - `http://localhost:3000/auth/confirm`

The default "Confirm signup" email works as it is: its link confirms the address and then opens `/auth/confirm`, which signs the user in and takes them to set up their authenticator. If the link is opened in a different browser from the one used to sign up, the email is still confirmed and the user is asked to sign in.

Supabase's built-in email sender is for testing: it only delivers to the email addresses of your Supabase team members and only a few emails an hour. Use your own email to test sign-up; a custom SMTP sender is set up before launch.

The local stack (`npx supabase start`) is configured the same way in `supabase/config.toml`. Its emails appear in Mailpit at http://127.0.0.1:54324.

### Call-centre agents (agent mode)

Agents use the same site. Their account's role switches it into agent mode automatically (overview §7.14):

- An **Agent mode** banner, and quick-start buttons for common calls on a new chat.
- Answers start with numbered handling steps, each marked *Internal* or *Public*, then the public policy basis. Sources are tagged *Internal* (and *Sample procedure*) or *Public*.
- A **Customer-ready wording** panel under each answer, with a copy button. It is written in a separate call that only ever sees public passages, so internal steps can't be read out to a caller. If no public policy covers the answer, the panel says so.
- Shorter sessions: signed out after **30 minutes** without activity, and a fresh authenticator code every **8 hours**. The database enforces both too, so a token used directly against the API gets no staff content once either limit passes.
- Agents can't switch to customer mode, and customers never see agent mode or staff documents.

Accounts are invite-only. Public sign-up always creates a customer, and an existing customer account can't be made into an agent one: agents get a separate work account.

1. **Invite:** `npm run invite-agent -- name@example.com` creates the account with the agent role and prints a one-time setup link. Send it to the agent through a channel you trust; whoever opens it first can set up the account. The agent opens it, chooses a password, and sets up an authenticator. Running the command again before they finish prints a new link.
2. **Deactivate:** `npm run deactivate-agent -- name@example.com` removes the role and blocks the account. Supabase rejects its sessions on the next request, and the database stops serving it staff content straight away. Its conversations are kept; delete the user in the dashboard to remove them.

Both scripts read `.env.ingest`, the only place the service-role key lives, plus `SITE_URL` there for the link (see `.env.ingest.example`).

The setup link lasts as long as Supabase's **Email OTP Expiration** (**Authentication → Providers → Email**, or **Sign In / Providers → Email**). The default is one hour; set it to **86400** seconds (24 hours), the longest Supabase allows. The overview asked for 48 hours, which Supabase doesn't support; if a link expires, run the invite again for a new one. This setting also applies to sign-up confirmation links.

### Test users for the evaluation

`npm run eval` signs in as a customer test user, and as an agent test user for the agent questions, each with a password and a TOTP code, so it gets real MFA-verified sessions and the same RLS as everyone else. The web app never uses them.

1. In the Supabase dashboard, open **Authentication → Users → Add user → Create new user**. Use an email you control, a strong password, and tick **Auto Confirm User**.
2. In `.dev.vars`, fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DEV_USER_EMAIL` and `DEV_USER_PASSWORD` (see `.dev.vars.example`).
3. Run `npm run dev-user`. It enrols an authenticator for that user and saves its secret to `.dev.vars` as `DEV_USER_TOTP_SECRET`.
4. For the agent questions: fill in `DEV_AGENT_EMAIL` (a different address) and `DEV_AGENT_PASSWORD` in `.dev.vars`, run `npm run invite-agent -- --test-user` to create it as an agent, then `npm run dev-user -- --agent`, which saves `DEV_AGENT_TOTP_SECRET`.

These values stay in `.dev.vars` only. Never set them as Cloudflare secrets.

## Deployment

The live site is https://kq-policy-assistant.neema-mapelu.workers.dev. To deploy a change: apply any new migrations with `npx supabase db push`, then run `npm run deploy` (it refuses to build if a secret would end up in the bundle). The Worker's three secrets are described under [Secrets for the deployed site](#secrets-for-the-deployed-site). Sign-up and password emails go through a custom SMTP server set in the Supabase dashboard (Authentication → Emails → SMTP Settings), because Supabase's built-in sender only mails the project's own team.

## Release review

- [OWASP Top 10 and LLM Top 10 review](docs/security/owasp-review.md)
- [Success criteria with evidence](docs/success-criteria.md)
- [Threat model](docs/security/threat-model.md)
- [Evaluation report](eval/report.md)

## Project management

Work is tracked on the GitHub project board. There is one milestone per build phase, and every change is linked to an issue and merged through a pull request with green CI.

## Security

Security principles, the threat model and scan results live in [`docs/security/`](docs/security/). To report a vulnerability, see [SECURITY.md](SECURITY.md).

### Hardening and privacy (Phase 10)

- **Headers:** `next.config.ts` sets HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and COOP on every route. `proxy.ts` adds a Content-Security-Policy with a fresh nonce per request, so every page is rendered per request. After deploying, check the site at [securityheaders.com](https://securityheaders.com).
- **Rate limits** (`wrangler.jsonc`, `lib/security/rate-limit.ts`): 20 chat messages a minute per user and 60 per IP address; 30 sign-in, sign-up and code attempts a minute per IP address and 5 per account. The bindings deploy with the Worker. If a limiter is missing or fails, the request is refused.
- **Audit log** (`public.audit_log`): security events only, never message text, passwords or codes, with a shortened IP address. Nobody can read it through the API; read it in the Supabase dashboard (Table Editor → `audit_log`) or with SQL.
- **Retention:** a daily `pg_cron` job (`purge-expired-data`, 03:17 UTC) deletes conversations 12 months after their last activity and audit entries after 12 months.
- **Account deletion:** Settings → *Delete my account*, with a code from the authenticator app. Agent accounts are removed by the administrator instead.
- **Privacy notice:** `/privacy`, public. Sign-up needs consent to it; the notice version and time are saved in the account's `user_metadata.privacy_consent`. Change `PRIVACY_VERSION` in `lib/legal.ts` when the notice changes.

### Experience features (Phase 11)

- **Answers:** Markdown for skimming, the exact source passage on request, suggested follow-up questions, a copyable summary when a question is escalated, Copy, and thumbs up or down with reasons (`message_feedback`).
- **History:** search across your own conversations (server-side, under RLS).
- **Sharing:** passengers can share one question and answer as a read-only link (`/s/<id>`) that expires after 30 days and can be turned off in the chat or in Settings. Agents can't share.
- **Display:** light or dark mode (follows the device by default) and text size, in Settings.
- **Pre-travel checklist** (`/checklist`, passengers): one message about the trip, one checklist with sources; topics the knowledge base doesn't cover are listed with the contact details. *Save as PDF* prints the checklist and its sources only.
- **Insights** (`/admin`, administrators): question volume, answer, escalation and refusal rates, most-cited documents, knowledge gaps and recent thumbs-down answers. No emails or ids; detail only for the last 30 days; each visit is audit-logged. Give the role with `npm run set-admin -- <email>`, then sign in again.

## Authorship

The project is owned and directed by Neema Mapelu. Parts of the code are written with the AI assistant Claude, and those commits are marked `Co-Authored-By: Claude`. Every change is reviewed and merged by the owner.
