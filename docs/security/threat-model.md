# Threat Model (STRIDE)

Version 1, written during Phase 1. It is updated at the end of every phase (see the review log).

## System

```
Browser (customer or agent)
   │ HTTPS
   ▼
Cloudflare Workers ── Next.js server (proxy.ts, /api/chat)
   │                         │
   ▼                         ▼
Supabase                  OpenAI API
(Auth + MFA, Postgres,    (chat model, embeddings)
 RLS, pgvector)
```

The ingestion job and deployments run in GitHub Actions.

## Assets

| ID | Asset | Why it matters |
|----|-------|----------------|
| A1 | User accounts and MFA factors | Account takeover exposes conversations |
| A2 | Conversations and messages | May contain personal travel details |
| A3 | Staff procedures (agent corpus) | Internal content that must never reach customers |
| A4 | API keys (OpenAI, Supabase service role, Cloudflare) | Abuse, cost, or full database access |
| A5 | Answer integrity | Wrong fees or rules cause harm and loss of trust |
| A6 | CI/CD pipeline | A compromised pipeline can ship malicious code |

## Trust boundaries

1. Browser ↔ Cloudflare Worker (untrusted input enters here)
2. Worker ↔ Supabase (user session vs service role)
3. Worker ↔ OpenAI (user text and policy text leave the system)
4. GitHub Actions ↔ Cloudflare and Supabase (deploy and ingestion credentials)

## Threats

| ID | STRIDE | Threat | Mitigation | Overview § | Status |
|----|--------|--------|------------|------------|--------|
| S1 | Spoofing | Stolen password used to sign in | Mandatory TOTP MFA; chat and data require AAL2. Until Phase 8 the chat route only accepts the development test user under `npm run dev` and returns 401 in every production build | 10.1 | Planned (Phase 8) |
| S2 | Spoofing | Customer claims agent role | Role in admin-only `app_metadata`; invite-only agents | 10.11 | Planned (Phase 9) |
| T1 | Tampering | Prompt injection makes the model ignore its rules | Fixed server-side prompt, passages in a delimited block that a passage can't close, scope check that fails to *off topic*, confidence gate before generation, no tools. Until Phase 8 the browser sends the chat history, so earlier turns are untrusted too; Phase 8 reads them from the database | 10.4 | Done (Phase 6); injection tests in Phase 7 |
| T2 | Tampering | Malicious or vulnerable dependency | Lockfile, `npm ci`, Dependabot, dependency scans | 15.1, 15.5 | Partly done (Dependabot) |
| R1 | Repudiation | User denies deleting data or changing MFA | Append-only audit log | 10.10 | Planned (Phase 10) |
| I1 | Information disclosure | User reads another user's conversations | RLS on every table, every policy requires AAL2, anon has no grants; pgTAP tests in `supabase/tests/rls.test.sql` run in CI | 10.2 | Done (Phase 3) |
| I2 | Information disclosure | Customer receives staff procedures | Audience RLS on corpus (role read from `app_metadata` only), `match_documents` is security invoker, tested in CI; retrieval runs with the user's own session (integration test in CI); a post-retrieval guard blocks the answer if any staff chunk reaches a customer; leakage evaluation still to come | 10.11 | Mostly done (Phases 3, 6); leakage tests in Phase 7, 9 |
| I3 | Information disclosure | API key committed, exposed to the browser, or baked into the Worker bundle | Keys server-only in Cloudflare secrets / `.dev.vars`, `.env*` ignored, `check-env` guard before every Cloudflare build, env validation, Gitleaks and push protection | 10.3 | In progress (Phase 2) |
| I4 | Information disclosure | Personal data sent to OpenAI | Server masks card (Luhn-checked), passport, phone and booking-reference patterns before every OpenAI call and tells the user; a note under the input; privacy notice | R7, 11 | Partly done (Phase 6); notice in Phase 10 |
| I5 | Information disclosure | Model invents fees or rules | Answers only from passages above the similarity threshold, otherwise the fixed escalation reply without calling the model; sources built from stored chunks, not the model; evaluation set | 6, 13 | Partly done (Phase 6); threshold calibrated in Phase 7 |
| T3 | Tampering | Fetched KQ page text carries HTML or script into answers and source snippets | Fetch script drops script, style, form and nav elements from the parsed DOM; the chat UI must render markdown with raw HTML disabled | 10.4 | Partly done (Phase 4); rendering in Phase 7 |
| D1 | Denial of service | Flooding `/api/chat` to run up OpenAI cost | Rate limits, length limits, OpenAI budget cap | 10.8 | Partly done (budget cap) |
| E1 | Elevation of privilege | Compromised CI job gains deploy rights | Least-privilege workflow permissions, SHA-pinned actions, protected environments | 15.5 | In progress (Phase 1) |

## Review log

| Date | Phase | Changes |
|------|-------|---------|
| 2026-10-16 | 1 | First version |
| 2026-10-16 | 2 | I3: OpenNext copies `.env*` values into the Worker bundle; secrets moved to Cloudflare bindings and a pre-build guard added |
| 2026-10-16 | 3 | I1, I2: database RLS and grants in place and tested; a role in `user_metadata` is ignored |
| 2026-10-16 | 4 | T3 added: KQ text is fetched at ingest (never committed, repo is public), and fetched markup must never be rendered as HTML |
| 2026-10-16 | 5 | I3, E1: the service-role key is used only by the ingest script and kept in `.env.ingest`, which isn't bundled. `replace_document_chunks` can be called only by `service_role` (tested) and copies the audience from the document, never from the caller |
| 2026-10-16 | 6 | T1, I2, I4, I5: grounded chat with scope check, confidence gate, staff-chunk guard and PII masking. The deployed chat is closed (401) until Phase 8 sign-in; local development uses a test user with a real AAL2 session, never the service role |
