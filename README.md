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

## Project management

Work is tracked on the GitHub project board. There is one milestone per build phase, and every change is linked to an issue and merged through a pull request with green CI.

## Security

Security principles, the threat model and scan results live in [`docs/security/`](docs/security/). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Authorship

The project is owned and directed by Neema Mapelu. Parts of the code are written with the AI assistant Claude, and those commits are marked `Co-Authored-By: Claude`. Every change is reviewed and merged by the owner.
