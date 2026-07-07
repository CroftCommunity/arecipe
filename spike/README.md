# spike/ — Phase 0 discovery code (NON-PRODUCTION)

Archived probe code from Phase 0, kept for diagnostic value per the plan's
Discovery Exemption dispositions. **Nothing here is under TDD or vetted for
production.** Secrets come from the gitignored `.env`; nothing here contains
credentials.

- `d1-oauth/` — loopback OAuth end-to-end probe (BrowserOAuthClient sandbox
  app + Playwright driver), app-password mint helper, and the D5 seam probe.
  Reference material for Phase 3's auth module and its `@live` tests.
- `d6-cid/` — Tier 2 CID recompute (lex-JSON → DAG-CBOR → sha-256 → CIDv1).
  The algorithm promotes into Phase 4's cache verify under TDD.

Findings live in `plans/2026-07-07-1-plan-build-execution.md` (Verified
Assumptions + Review Log) and `tests/fixtures/*/PROBE-NOTES.md`.
