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
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

The app refuses to start if a required variable in `.env.local` is missing.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run build` | Production build |
| `npm run preview` | Build for Cloudflare and run the Worker locally (needs `.dev.vars`, see `.dev.vars.example`) |
| `npm run deploy` | Build and deploy to Cloudflare Workers |

## Project management

Work is tracked on the GitHub project board. There is one milestone per build phase, and every change is linked to an issue and merged through a pull request with green CI.

## Security

Security principles, the threat model and scan results live in [`docs/security/`](docs/security/). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Authorship

The project is owned and directed by Neema Mapelu. Parts of the code are written with the AI assistant Claude, and those commits are marked `Co-Authored-By: Claude`. Every change is reviewed and merged by the owner.
