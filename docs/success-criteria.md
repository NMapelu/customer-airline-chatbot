# Success criteria (overview §14)

Each criterion with its evidence, as of 2026-10-23. **Met** means the evidence is in the repository or CI. **Partly met** says what's missing and why.

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Sign up, enrol MFA, sign in with a code and reach the chat; without MFA no access | Met | `proxy.ts` and `lib/auth/access.ts` send any session below AAL2 to the code page; integration tests "the test user sign-in reaches AAL2", "a session without MFA retrieves nothing" and "a session without MFA sees no conversations and cannot start one" (`tests/integration/rag.test.ts`); screenshots of sign-up, the QR code step and the code prompt (to add, see below) |
| 2 | Evaluation targets | Partly met | `eval/report.md` (2026-10-21): answerable 95.5% (target 90%), uncovered escalated 100% (95%), off-topic refused 100% (100%), injection 100% (100%), leakage 0 leaks in 30 tests, 74/74 answers grounded (0 unsupported fees, limits or deadlines). **Missing:** the agent questions (target 90%) and a final run after the follow-up fix (follow-up questions were at 80%). Both need about 5 USD of OpenAI credit |
| 3 | Every corpus-based answer shows at least one source link | Met | Sources stored with each answer and listed under it (`lib/rag/answer.ts`, `app/(chat)/chat.tsx`); the evaluation scores the citation of every answerable question |
| 4 | An invited agent activates with MFA and uses agent mode; customers can't reach agent mode or staff content by any route | Met | Integration tests "an invited agent sets a password and an authenticator, then sees staff content", "a customer retrieves public chunks only", "a customer's account can't be turned into an agent account", "conversations are tagged with the real role, whatever the caller claims"; pgTAP audience tests; `lib/rag/gate.test.ts` (forced staff chunk is blocked); evaluation leakage 30/30 |
| 5 | History saved, listed, resumable and deletable per user | Met | Integration tests "a customer's conversation is saved, read back in order, and listed" and "the owner can rename and permanently delete a conversation" |
| 6 | RLS tests prove no user can reach another user's data | Met | `supabase/tests/rls.test.sql` (pgTAP, runs in CI on every PR); integration test "another user can't read, add to, rename or delete someone's conversation" |
| 7 | No secret in the browser bundle or the repository | Partly met | `npm run check-env` blocks a build that would bundle a secret (every deploy); Gitleaks over the full history and the bundle scan ran clean on the Phase 12 branch. **Missing:** both running in CI on `main`, which comes with the Phase 12 pull request |
| 8 | Publicly reachable on Cloudflare Workers; works in current desktop and mobile browsers | Met | https://kq-policy-assistant.neema-mapelu.workers.dev (securityheaders.com grade A+ on 2026-10-23); screenshots on a desktop browser and a phone (to add, see below) |
| 9 | CI passes all quality, security and evaluation gates on `main` | Partly met | Quality gates (lint, types, unit tests, corpus check, build, schema lint, RLS and integration tests) pass on `main`, and CodeQL runs on every PR. **Missing:** the security and evaluation gates in the Phase 12 pull request, parked until funds allow |
| 10 | Manual OWASP Top 10 and LLM Top 10 review finds no unresolved high issue | Met (signed off 2026-10-23) | `docs/security/owasp-review.md`: two findings fixed, five low or medium items open with reasons |
| 11 | The production release passed every scan in §15.1 and §15.2, and continuous scanning is active | Not met yet | Waits on the Phase 12 pull request (pipeline, dynamic scans, nightly re-scans) |
| 12 | Each security principle can be demonstrated | Met | See the table below |

## The five security principles (criterion 12)

| Principle | Demonstrated by |
|-----------|-----------------|
| Secure by design | STRIDE threat model written in Phase 1 and updated every phase (`docs/security/threat-model.md`); the model has no tools or internet; scope check and confidence gate run before generation |
| Secure by default | MFA can't be turned off; RLS on every table (pgTAP); new accounts get the lowest role, and agent and admin roles are granted only by admin scripts; strict headers and a nonce CSP on every route; 12-month retention and 30-day share expiry on from the start |
| Least privilege | The web app holds only the anon key and acts as the signed-in user; the service-role key lives only in `.env.ingest` for admin scripts; column grants limit what users may write (feedback, shares); admins see only aggregated insights |
| Fail-safe defaults | A failed session check rejects the request (`proxy.ts`); RLS returns nothing without a matching policy; a failed scope check refuses; failed retrieval escalates; a missing rate limiter refuses; a missing setting stops the app (`lib/env.ts`) |
| Defense in depth | Access checked in `proxy.ts`, again in each route, and again by RLS; staff content blocked by RLS and again by the post-retrieval guard; answer links limited to kenya-airways.com; PII masked before OpenAI |

## Evidence still to collect

These need Neema's own screen, so they are listed in `notes/phase-13/setup-steps.md`:

- Screenshots for criteria 1 and 8 (sign-up with MFA, chat on desktop and on a phone).
- The final evaluation run (criterion 2), once there is OpenAI credit.
