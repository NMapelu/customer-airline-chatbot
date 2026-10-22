# OWASP review

Manual walkthrough of the release against the **OWASP Top 10 (2021)** and the **OWASP Top 10 for LLM Applications (2025)**, as overview §10.12 and success criterion 10 ask. Each row names the controls and where to see them working (a test, a file or a report). Severity is for anything left open.

Reviewed on 2026-10-23 against `main` plus the Phase 13 pull request. Reviewer: Claude (AI assistant), for Neema Mapelu, who checks and signs off below.

**Result: no unresolved high-severity issue.** Two findings were fixed during the review (F1, F2). Five lower-severity items stay open with a reason (O1 to O5).

## OWASP Top 10 (2021)

| ID | Risk | Controls | Evidence |
|----|------|----------|----------|
| A01 | Broken access control | Deny by default at three layers: `proxy.ts` (session and AAL2 before any protected page or API), each route and server action re-checks the user (`lib/auth/access.ts`), and RLS on every table with every policy requiring AAL2. Staff documents are filtered by audience in RLS and again by the post-retrieval guard (`lib/rag/gate.ts`). Admin data only through `admin_insights()`, which checks the role at AAL2. Shared answers only through `get_shared_answer` (no ids, no user data). Agents' idle timeout enforced in the database (`staff_access()`) | pgTAP `supabase/tests/rls.test.sql` (67 tests in CI); `tests/integration/*` (another user can't read, add to, rename or delete a conversation; customer can't reach staff chunks); unit test forcing a staff chunk into a customer request (`lib/rag/gate.test.ts`); `tests/deployed/access.test.ts` (Phase 12 PR, passes against a local preview) |
| A02 | Cryptographic failures | HTTPS only with HSTS (`next.config.ts`); passwords hashed by Supabase Auth; HTTP-only, Secure, SameSite cookies (`lib/supabase/auth-state.ts`); ids for conversations, shares and feedback are random UUIDs; rate-limit keys are hashed before leaving the Worker; data encrypted at rest by Supabase | `lib/security/headers.test.ts`; response headers on the live site |
| A03 | Injection | No SQL built from strings: all data access through the Supabase client (parameterised) and SQL functions; search escapes `%` and `_` before `ilike`. Answers rendered from Markdown with raw HTML dropped and a fixed element list (`app/(chat)/answer-text.tsx`); no `dangerouslySetInnerHTML` (ESLint `react/no-danger` set to error in the Phase 12 PR). Nonce-based CSP with no `unsafe-inline` or `unsafe-eval` blocks injected scripts. Every request body validated with a zod schema | `lib/security/headers.test.ts`; Semgrep and CodeQL clean (CodeQL on every PR) |
| A04 | Insecure design | STRIDE threat model written before the code and updated each phase (`docs/security/threat-model.md`); the model has no tools and no internet; scope check and confidence gate run before generation; fail-safe responses on every error (refuse or escalate, never guess) | Threat model change log; evaluation report (`eval/report.md`) |
| A05 | Security misconfiguration | Strict headers on every route (CSP with nonce, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP); `X-Powered-By` off; generic error pages (`app/error.tsx`, `app/global-error.tsx`) with details only in server logs; Worker preview URLs off (`wrangler.jsonc`); the app refuses to start with a missing or malformed setting (`lib/env.ts`); `npm run check-env` stops a build that would bundle a secret | `lib/security/headers.test.ts`; securityheaders.com grade for the live site (see `docs/success-criteria.md`) |
| A06 | Vulnerable and outdated components | Lockfile and `npm ci`; `npm audit --omit=dev` reports 0 issues after the `glob` override (F2); Dependabot, OSV-Scanner, Trivy and dependency review are ready in the Phase 12 PR | `npm audit --omit=dev` output; Phase 12 PR checks |
| A07 | Identification and authentication failures | Mandatory TOTP for everyone (AAL2), no way to turn it off; replacing the authenticator needs a current code; password at least 12 characters with mixed case and a digit (`lib/auth/password-rule.ts`); sign-in, sign-up and code checks rate-limited per IP and per account, failing closed (`lib/security/attempts.ts`); agents invite-only with one-time setup links, 30-minute idle timeout and 8-hour code re-check; deactivation revokes all sessions | Integration tests (MFA through the real API); `lib/security/rate-limit.test.ts` |
| A08 | Software and data integrity failures | Every GitHub Action pinned to a commit SHA; the knowledge base is written only by the admin ingest script with the service-role key (`replace_document_chunks` copies the audience from the document, never from the caller); KQ text is fetched from a fixed source list, never committed, and never rendered as HTML | `supabase/tests/ingest.test.sql`; `scripts/check-corpus.mjs` in CI |
| A09 | Security logging and monitoring failures | Audit log of security events (sign-ins, failed codes, AAL1 rejections, rate limits, role changes, agent invites and deactivations, blocked staff content, admin views) with a shortened IP and never message text, passwords or codes; nobody can read it through the API; Cloudflare observability logs on | `supabase/tests/audit.test.sql`; O3 below |
| A10 | Server-side request forgery | The server never fetches a URL a user supplies: it calls only Supabase and OpenAI at fixed addresses from configuration. The Worker runs with `global_fetch_strictly_public`, so even a bug couldn't reach private addresses | `wrangler.jsonc` compatibility flags |

## OWASP Top 10 for LLM Applications (2025)

| ID | Risk | Controls | Evidence |
|----|------|----------|----------|
| LLM01 | Prompt injection | Fixed server-side system prompt; question and passages in delimited sections marked as data; scope check before retrieval; the model has no tools, so an injection can't fetch, send or change anything; answers checked for grounding in evaluation; links in answers limited to kenya-airways.com (F1) | Evaluation: injection 16/16 (100%) on every run; red-team suite `redteam/` (Phase 12 PR) |
| LLM02 | Sensitive information disclosure | Card, passport, phone and booking-reference patterns masked before any text reaches OpenAI (`lib/rag/pii.ts`); customers never get staff content (RLS, gate, public-only customer-ready wording for agents); shared answers carry no email, name or ids; the admin dashboard returns no ids and detail only for 30 days | `lib/rag/pii.test.ts`; evaluation leakage 30/30 (100%); `lib/rag/gate.test.ts` |
| LLM03 | Supply chain | Models used through OpenAI's API only (no downloaded weights); npm dependencies locked and audited; actions pinned | `package-lock.json`; Phase 12 PR |
| LLM04 | Data and model poisoning | No training or fine-tuning. The corpus comes only from a fixed list of KQ pages (`docs/sources.json`) and 10 labelled sample staff procedures, loaded only by the admin ingest script; users can't add documents; feedback is stored but never fed back into answers | `scripts/check-corpus.mjs`; `supabase/tests/ingest.test.sql` |
| LLM05 | Improper output handling | Model output is treated as untrusted text: Markdown with raw HTML dropped, a fixed element list, links only over https to kenya-airways.com (F1), no output ever run as code, SQL or a URL fetch | `lib/chat/links.test.ts`; `app/(chat)/answer-text.tsx` |
| LLM06 | Excessive agency | The model has no tools, functions or write access. It can only produce text, which the server streams back | `lib/rag/answer.ts` (no `tools` passed) |
| LLM07 | System prompt leakage | The prompt holds no secrets, keys or access rules (access is enforced by the database, not the prompt); extraction attempts are refused | Evaluation injection set; red-team prompt-leak checks (Phase 12 PR) |
| LLM08 | Vector and embedding weaknesses | Embeddings in Supabase pgvector behind RLS: `match_documents` is security invoker, so a customer's search can't return staff chunks; at most 10 matches per query; the gate checks the audience again after retrieval | `supabase/tests/rls.test.sql`; integration retrieval tests |
| LLM09 | Misinformation | Answers only from retrieved KQ passages; confidence gate and coverage check escalate instead of guessing; every answer shows its sources with the date they were fetched, and old pages are flagged; low temperature (0.2); disclaimer under every answer | Evaluation: answerable 95.5%, uncovered 100% escalated, 74/74 answers grounded |
| LLM10 | Unbounded consumption | 20 messages a minute per user and 60 per IP (fail closed); questions capped at 1000 characters; answers capped at 700 tokens and helper calls at 120 to 200; at most 8 passages of 3000 characters each; the checklist handles at most 6 topics; OpenAI project spend cap (setup step) | `lib/rag/config.ts`; `lib/security/rate-limit.test.ts` |

## Findings fixed during the review

| ID | Finding | Severity | Fix |
|----|---------|----------|-----|
| F1 | Answers could carry an https link to any site. The overview (§10.0, AI layer) asks for links outside the sources to be removed. An injected passage or a model slip could have shown a convincing phishing link | Medium | Links are kept only for https pages on kenya-airways.com and its subdomains; anything else shows as plain text (`lib/chat/links.ts`, with tests) |
| F2 | `npm audit --omit=dev` reported 4 high findings in `glob`, pulled in by a build-time minifier. The vulnerable code path (the `glob` command line) isn't used, but the finding blocks a clean audit | High (not exploitable here) | `overrides` pins the fixed `glob` 10.5; audit reports 0 issues |

## Open items (not high severity)

| ID | Item | Severity | Why it stays open |
|----|------|----------|-------------------|
| O1 | The CI/CD scans and the automated staging and production pipeline (Phase 12) aren't merged yet | Medium | Parked by the owner until funds allow; the scans already ran clean locally on that branch. Success criteria 9 and 11 stay open until it's merged |
| O2 | No WAF managed rules or bot protection in front of the app | Low | `workers.dev` addresses can't use Cloudflare's WAF without a custom domain. Rate limits, MFA and RLS cover the main abuse routes |
| O3 | No alerting on repeated failures; the audit log is read by hand | Low | A free-plan project has no alerting service. The weekly production scans in the Phase 12 PR open an issue on failure |
| O4 | Cloudflare rate limits are counted per Cloudflare location, so a spread-out attacker gets somewhat more than the stated limit | Low | Accepted: they still bound abuse, and fail closed |
| O5 | A lost authenticator can only be recovered by hand, as the README describes | Low | Backup codes are listed as a future enhancement (overview §18) |

## Sign-off

- [x] Reviewed and signed off by Neema Mapelu on 2026-10-23
