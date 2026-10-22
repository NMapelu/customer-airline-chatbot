# CI/CD and security scanning

How the pipeline in `.github/workflows/` covers overview §15. Each scan blocks on a critical or high finding, or any detected secret. A finding that is checked and accepted is recorded with its reason (see "Accepted findings").

## When each check runs

| Workflow | Runs | Checks |
|----------|------|--------|
| `ci.yml` | Every PR and push to `main` | ESLint (with `no-eval`, `react/no-danger` and similar as errors), TypeScript, corpus front matter, unit tests, Next.js build, Cloudflare build, **bundle scan** (no secret in the files sent to browsers), Supabase schema lint, pgTAP RLS tests, integration tests |
| `security.yml` | Every PR and push to `main` | **Gitleaks** over the full history, **Semgrep** (OWASP Top 10, Next.js, TypeScript, JavaScript rules), **npm audit** (production dependencies), **OSV-Scanner** (all dependencies), **dependency review** (new dependencies: high severity or GPL/AGPL licence blocks), **Trivy** (vulnerabilities, misconfiguration, secrets), **actionlint** and **zizmor** (workflow security), **Syft** CycloneDX SBOM |
| `preview.yml` | Every PR from this repository | Deploys the PR to the preview Worker, then runs `dynamic-scans.yml`: **ZAP baseline**, **access-control tests** (`tests/deployed/`), **promptfoo red team** (`redteam/`) |
| `eval.yml` | PRs that change `docs/`, `lib/rag/`, `lib/eval/`, `eval/questions.jsonl` or `scripts/eval.ts` | The full evaluation; fails below any §14 target, on an ungrounded answer or on an error |
| `release.yml` | Every merge to `main` | Builds once, deploys to **staging**, runs the **ZAP full scan** signed in as the test customer, the access tests and the red team, then waits for the owner's approval and deploys the **same build** to production. A failed smoke test rolls production back to the previous version |
| `nightly.yml` | Daily; production scans on Mondays | OSV re-scan of `main`'s SBOM against new advisories; weekly ZAP baseline, access tests and red team on production. A failure opens (or comments on) one issue |
| `scorecard.yml` | Push to `main`, weekly | OpenSSF Scorecard of the repository's supply-chain practices |
| `dependabot.yml` | Weekly | npm and GitHub Actions updates, through the same checks |

GitHub's CodeQL default setup (Security → Code scanning) runs alongside.

## What the dynamic tests prove

- **Access control** (`tests/deployed/access.test.ts`, OWASP A01): security headers and a nonce CSP on every response; no session is redirected or gets 401; a password-only session is refused by the pages, the APIs and the database; a customer can't read an agent's conversation through the page, the chat API or the database; a customer can't read staff documents, the audit log, `/admin` or `admin_insights`, or open an agent conversation; an agent can't use the passenger checklist or `/admin`; an unknown share link shows nothing.
- **Red team** (`redteam/promptfooconfig.yaml`, OWASP LLM01, LLM02, LLM07): prompt injection and jailbreaks are refused, fake policies aren't confirmed, the system prompt and staff procedures never come back, personal data isn't repeated. Checks are fixed rules, so the suite needs no model of its own.
- **ZAP**: baseline (passive) on every preview and weekly on production; full (active) on staging, signed in. The full scan leaves out `/api/chat`, `/api/checklist`, `/settings`, `/auth` and `/mfa`, and submits no forms: attacking those would spend OpenAI credit or lock the test account. Their access rules are covered by the access tests instead.

## Environments and secrets

| Where | Holds |
|-------|-------|
| Cloudflare Worker secrets (`wrangler secret put --env ...`) | `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` for each Worker. GitHub never sees the Workers' OpenAI key |
| GitHub repository secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the test accounts `TEST_CUSTOMER_*`, `TEST_AGENT_*` |
| GitHub environment `eval` | `OPENAI_API_KEY`, used only by the evaluation |
| GitHub environment `production` | No secrets; required reviewer (the owner) and deployments from `main` only |

The preview and staging Workers use the production Supabase project and sign in only as the two test accounts, which hold no passenger data. The service-role key is never in GitHub or Cloudflare.

## Accepted findings

| File | Finding | Reason | Review by |
|------|---------|--------|-----------|
| `.gitleaksignore` | Three "generic API key" matches in `lib/auth/schemas.test.ts` and `lib/totp.test.ts` | Test data (the RFC 6238 test secret and made-up passwords), not real keys | — |
| `osv-scanner.toml` | GHSA-vfj7-8cjw-p6xm (`braces`) | Used only by ESLint at development time, never shipped; no fixed version yet | 2027-01-31 |
| Source (`// nosemgrep -- reason`) | Three Semgrep regex warnings in `lib/eval/score.ts` and `scripts/check-corpus.mjs` | The patterns are built from repository-controlled values, not user input | — |
| `.zap/rules.tsv` | None yet | | |

## When a check fails

Open the failed run in the **Actions** tab. ZAP, the red team, the evaluation and the SBOM attach their reports as artifacts at the bottom of the run page. Fix the finding, or, if it is a false positive, record it in the matching file above with the reason, in the same pull request.
