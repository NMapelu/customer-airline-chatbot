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
| S1 | Spoofing | Stolen password used to sign in | Mandatory TOTP MFA; chat and data require AAL2 | 10.1 | Planned (Phase 8) |
| S2 | Spoofing | Customer claims agent role | Role in admin-only `app_metadata`; invite-only agents | 10.11 | Planned (Phase 9) |
| T1 | Tampering | Prompt injection makes the model ignore its rules | Fixed server-side prompt, delimited untrusted text, scope check, no tools | 10.4 | Planned (Phase 6) |
| T2 | Tampering | Malicious or vulnerable dependency | Lockfile, `npm ci`, Dependabot, dependency scans | 15.1, 15.5 | Partly done (Dependabot) |
| R1 | Repudiation | User denies deleting data or changing MFA | Append-only audit log | 10.10 | Planned (Phase 10) |
| I1 | Information disclosure | User reads another user's conversations | RLS on every table, every policy requires AAL2, anon has no grants; pgTAP tests in `supabase/tests/rls.test.sql` run in CI | 10.2 | Done (Phase 3) |
| I2 | Information disclosure | Customer receives staff procedures | Audience RLS on corpus (role read from `app_metadata` only), `match_documents` is security invoker, tested in CI; post-retrieval guard and leakage tests still to come | 10.11 | Partly done (Phase 3); rest in Phase 9 |
| I3 | Information disclosure | API key committed, exposed to the browser, or baked into the Worker bundle | Keys server-only in Cloudflare secrets / `.dev.vars`, `.env*` ignored, `check-env` guard before every Cloudflare build, env validation, Gitleaks and push protection | 10.3 | In progress (Phase 2) |
| I4 | Information disclosure | Personal data sent to OpenAI | PII masking, user guidance, privacy notice | R7, 11 | Planned (Phase 6, 10) |
| I5 | Information disclosure | Model invents fees or rules | Retrieval grounding, confidence gate, citations, evaluation set | 6, 13 | Planned (Phase 6, 7) |
| D1 | Denial of service | Flooding `/api/chat` to run up OpenAI cost | Rate limits, length limits, OpenAI budget cap | 10.8 | Partly done (budget cap) |
| E1 | Elevation of privilege | Compromised CI job gains deploy rights | Least-privilege workflow permissions, SHA-pinned actions, protected environments | 15.5 | In progress (Phase 1) |

## Review log

| Date | Phase | Changes |
|------|-------|---------|
| 2026-10-16 | 1 | First version |
| 2026-10-16 | 2 | I3: OpenNext copies `.env*` values into the Worker bundle; secrets moved to Cloudflare bindings and a pre-build guard added |
| 2026-10-16 | 3 | I1, I2: database RLS and grants in place and tested; a role in `user_metadata` is ignored |
