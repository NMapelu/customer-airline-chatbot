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
| S1 | Spoofing | Stolen password used to sign in | Mandatory TOTP MFA: a password alone (AAL1) only reaches the enrol or code page. `proxy.ts` redirects every page and answers 401 on the API below AAL2, and denies when the check fails; pages, Server Actions and `/api/chat` check AAL2 again on the server; every RLS policy requires AAL2. The rules are unit-tested (`lib/auth/access.test.ts`) and the flow was tested end to end in a browser. MFA can't be removed, only replaced with a code from the current authenticator; recovery is manual | 10.1 | Done (Phase 8); sign-in rate limits in Phase 10 |
| S3 | Spoofing | Session token stolen by a malicious script | Session cookies are HTTP-only, SameSite=Lax and Secure outside local development; the browser never talks to Supabase directly, so no script needs the tokens; answers are rendered as plain text; CSP in Phase 10 | 10.0, 10.1 | Done (Phase 8); CSP in Phase 10 |
| S4 | Spoofing | Cross-site request makes a signed-in user's browser send a chat or change settings | SameSite=Lax cookies aren't sent on cross-site POSTs; Server Actions check the Origin header; `/api/chat` only accepts a JSON body | 10.0 | Done (Phase 8) |
| S2 | Spoofing | Customer claims agent role | Role in admin-only `app_metadata`; invite-only agents | 10.11 | Planned (Phase 9) |
| T1 | Tampering | Prompt injection makes the model ignore its rules | Fixed server-side prompt, passages in a delimited block that a passage can't close, scope check that fails to *off topic*, confidence gate before generation, no tools. Since Phase 8 the browser sends only the new question; earlier turns are read from the user's own saved history, so a client can't forge assistant turns | 10.4 | Done (Phases 6, 8); injection tests in Phase 7 |
| T2 | Tampering | Malicious or vulnerable dependency | Lockfile, `npm ci`, Dependabot, dependency scans | 15.1, 15.5 | Partly done (Dependabot) |
| R1 | Repudiation | User denies deleting data or changing MFA | Append-only audit log | 10.10 | Planned (Phase 10) |
| I1 | Information disclosure | User reads another user's conversations | RLS on every table, every policy requires AAL2, anon has no grants; pgTAP tests in `supabase/tests/rls.test.sql` run in CI. All history reads and writes use the user's own session; integration tests show another user can't read, add to, rename or delete a conversation, even with its id | 10.2 | Done (Phases 3, 8) |
| I6 | Information disclosure | Sign-up or sign-in reveals which emails have accounts | Sign-up shows the same message for new and existing emails; a wrong email or password gets one generic message; "confirm your email first" needs the right password | 10.1 | Done (Phase 8) |
| I2 | Information disclosure | Customer receives staff procedures | Audience RLS on corpus (role read from `app_metadata` only), `match_documents` is security invoker, tested in CI; retrieval runs with the user's own session (integration test in CI); a post-retrieval guard blocks the answer if any staff chunk reaches a customer; leakage evaluation still to come | 10.11 | Mostly done (Phases 3, 6); leakage tests in Phase 7, 9 |
| I3 | Information disclosure | API key committed, exposed to the browser, or baked into the Worker bundle | Keys server-only in Cloudflare secrets / `.dev.vars`, `.env*` ignored, `check-env` guard before every Cloudflare build, env validation, Gitleaks and push protection | 10.3 | In progress (Phase 2) |
| I4 | Information disclosure | Personal data sent to OpenAI | Server masks card (Luhn-checked), passport, phone and booking-reference patterns before every OpenAI call and before saving the question to the history, and tells the user; a note under the input; privacy notice | R7, 11 | Partly done (Phase 6); notice in Phase 10 |
| I5 | Information disclosure | Model invents fees or rules | Answers only from passages above the similarity threshold that a coverage check confirms answer the question (fails to escalation), otherwise the fixed escalation reply; sources built from stored chunks, not the model; evaluation set | 6, 13 | Partly done (Phases 6, 7); threshold calibrated on the evaluation set |
| T3 | Tampering | Fetched KQ page text carries HTML or script into answers and source snippets | Fetch script drops script, style, form and nav elements from the parsed DOM; the chat UI must render markdown with raw HTML disabled | 10.4 | Partly done (Phase 4); rendering in Phase 7 |
| D1 | Denial of service | Flooding `/api/chat` to run up OpenAI cost | Rate limits, length limits, OpenAI budget cap | 10.8 | Partly done (budget cap) |
| E2 | Elevation of privilege | Email confirmation link used as an open redirect, or to skip MFA | `/auth/confirm` checks the one-time token and always sends the user to the enrol page; Supabase only sends links to allow-listed URLs | 10.1 | Done (Phase 8) |
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
| 2026-10-21 | 7 | T1, I2, I5: evaluation of 166 customer questions (agent rows wait for Phase 9). Off-topic, injection and leakage 100% on all eight runs; 74/74 answers grounded on the final run. Coverage check added after the similarity gate (fails to escalation). See `eval/report.md` |
| 2026-10-21 | 8 | S1, S3, S4, I1, I6, E2, T1: real sign-up, email confirmation, mandatory TOTP and saved history replace the development test user. Checked at three layers (`proxy.ts`, server code, RLS); HTTP-only cookies; history read from the database, not the request |
