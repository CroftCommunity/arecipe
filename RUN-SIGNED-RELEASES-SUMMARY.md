# RUN-SIGNED-RELEASES v2 — run summary (2026-07-16)

Executed on branch `claude/signed-releases-v2-2yifm4`, one commit per part
boundary, gate green at each. Plan: `plans/2026-07-16-4-plan-signed-releases.md`
(Status + outcome table there). SUPERSEDES v1 (unexecuted).

## What shipped

- **Pipeline:** every build emits `release-manifest.json` (buildNumber =
  `git rev-list --count HEAD`, version, builtAt, SHA-256 of every dist file,
  pubkey fingerprint, Ed25519 sig over canonical JSON). CI's main-branch
  deploy signs via the `ARECIPE_SIGNING_SEED` secret; local + preview builds
  emit `sig: null` honestly. `--verify-manifest` self-check is wired into the
  gate and runs in-process after every build.
- **Client:** Account "Release & version" panel (verified / unsigned /
  invalid / couldn't-check, + "signing not yet enabled" and the quiet
  racing-deploy state); app-wide session-dismissible rust banner for
  unsigned/invalid on the production origin only; install-only-verified ON by
  default (unverified builds are never offered, and if one activates via SW
  lifecycle the install keeps serving the last verified version);
  current-version-only pin OFF by default (toast suppressed, manual check
  inert with `version locked at v<X>`, stamp shows the locked version, locked
  cache survives SW turnover). Both device-local, labeled "this install only".
- **Docs:** `docs/RELEASE-SIGNING.md` (runbook + threat table); BUILD-PLAN
  corrected to `app.arecipe.*` + staged-increment note; LEXICONS registers
  planned `app.arecipe.release` / `app.arecipe.status`.

## Red → green evidence (TDD per phase)

| Phase | RED (observed failing first) | GREEN |
|---|---|---|
| 1 core | `tests/unit/release/manifest.spec.ts` failed on missing `src/release/manifest.js` (23 tests, module-not-found) | 23 pass after `manifest.ts`/`verify.ts` |
| 1 build | `tests/e2e/release-manifest.spec.ts` 3/3 failed (no manifest emitted) | 3 pass after build.mjs signing; self-check proven to exit 1 on a tampered dist file AND on missing-when-expected sig |
| 3 | `config.spec.ts` / `routing.spec.ts` / `update-gate.spec.ts` failed on missing modules | 54 release-unit tests pass; sw.ts / sw-register wiring after |
| 4 | `origin.spec.ts` / `banner.spec.ts` / `panel.spec.ts` failed on missing modules; 2 new `build-stamp` tests failed on the missing pin option | 81 release+stamp tests pass; page wiring after |
| 5 | `tests/e2e/release.spec.ts` written against the wired app (1 timing fix: panel mounts pre-claim → reload after controller) | 8/8 pass |

## [verify-in-run] outcomes

1. **authModeFor / neutral classifier** — `authModeFor` at
   `src/auth/oauth-client.ts:37`. Extraction went the safe direction:
   `PRODUCTION_ORIGIN` + `isLoopbackHostname` now live in auth-free
   `src/release/origin.ts` (path-aware: PR previews SHARE the production
   origin under `/pr-preview/` — finding F1) and are re-exported from
   oauth-client. Browse bundle guard stays green.
2. **SW e2e probe** — Playwright cannot fixture SW-initiated fetches; no
   existing e2e exercises waiting workers. As the run spec's contingency
   ruled: verdict/routing/cleanup/gating are pure functions (54 unit tests);
   e2e asserts page-observable outcomes against a FIXTURE-SIGNED dist
   (`build:e2e` uses the committed test seed through the same env seam as CI),
   so "verified" — including the SW's activate self-verify — is real.
3. **noble delta — FLAG (D6 kept, reported honestly).** `@noble/ed25519` is
   dynamic-import-only: pages ship a lazy 8,093 B chunk (4,056 B gz) that
   loads ONLY when WebCrypto Ed25519 is absent; the SW build (no splitting)
   inlines it. vs main: sw.js 3,109→17,354 B min (1,323→7,519 B gz — includes
   verify/config/routing, not just noble); browse 9,147→10,399 B min
   (3,827→4,214 B gz), noble not eagerly loaded anywhere. Raw min total
   crosses the 10 KB flag line; decision unchanged per D6 (the ON-default must
   never silently no-op). Named future cut: SW-side WebCrypto-only.

## Owner's first-deploy checklist

See `docs/RELEASE-SIGNING.md` § First-deploy checklist: install the
`ARECIPE_SIGNING_SEED` secret → commit the pubkey to `src/release/keys.ts` →
merge → deploy log shows `self-check OK (signed…)` →
`arecipe.app/release-manifest.json` has non-null `sig` → Account panel shows
**verified** → a PR preview still reads **unsigned** with no banner. Until
then, production reads "signing not yet enabled" (couldn't-check tier, no
banner) — honest, and nothing breaks.

## Deferred (Phase 3 of BUILD-PLAN, verbatim per D9)

PDS record publication (`app.arecipe.release`); status canary
(`app.arecipe.status`); full per-file refuse-mode at install; Sigstore
transparency rider; offline key ceremony; multi-origin.
