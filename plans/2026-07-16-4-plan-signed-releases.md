# Signed releases v2 — signed manifests + verified-install default + version pin

**Status:** ✅ **Implemented 2026-07-16.** TDD-first (red → green per phase,
evidenced in `RUN-SIGNED-RELEASES-SUMMARY.md`). Gate green at every part
boundary: lint · typecheck (both tsconfigs) · 645 unit · build (signed +
unsigned self-checks) · 195 hermetic e2e. Bundle-split guard intact (Browse
ships zero auth code; the whole `src/release/` graph is auth-free). Owner's
one-time step remains: install `ARECIPE_SIGNING_SEED` + commit the pubkey —
checklist in `docs/RELEASE-SIGNING.md`.

A staged, honest increment of BUILD-PLAN Phase 3's signed-delivery design
(RUN-SIGNED-RELEASES v2; supersedes the unexecuted v1). Part 1: every normal
deploy additionally emits and signs `release-manifest.json` with an INTERIM
Ed25519 key held in GitHub Actions secrets — zero new manual release steps.
Part 2: an Account "Release & version" panel (verified / unsigned / invalid /
couldn't-check), an app-wide dismissible rust banner for the bad states on the
production origin, an **install-only-verified** toggle ON by default, and a
**version pin** OFF by default (current-version-only). Both settings are
DEVICE-LOCAL with a UI note saying so — a pin references a device-local cache
another install may never have had, so it must not roam.

Naming ruling: future records are `app.arecipe.release` / `app.arecipe.status`;
`fyi.recipe.*` is corrected in the LIVING docs (BUILD-PLAN). `docs/sources/`
stays frozen as historical.

## Phase 0 — re-grounding findings (verified against main @ b5c75a9)

- **F1 — previews share the PRODUCTION ORIGIN.** `https://arecipe.app/pr-preview/pr-N/`
  is the same origin as production (custom domain covers all paths of the
  gh-pages branch). An origin-only classifier cannot tell them apart; the
  existing precedent is PATH-based: `isPreviewOrigin()` in
  `src/auth/preview-session.ts` (`pathname.includes('/pr-preview/')`), already
  imported by `nav.ts` into every page including Browse (type-only @atproto
  imports, so the bundle-split guard stays green). The run spec's neutral
  classifier (`src/release/origin.ts`) is therefore **path-aware**:
  `production` = origin `https://arecipe.app` off `/pr-preview/`; `preview` =
  that origin under `/pr-preview/` (or any other non-loopback origin, e.g.
  `croftcommunity.github.io`); `loopback` = localhost/127.0.0.1/[::1].
  [verify-in-run resolved: `authModeFor` lives at `src/auth/oauth-client.ts:37`;
  the `PRODUCTION_ORIGIN` constant moves to the auth-free `src/release/origin.ts`
  and `oauth-client.ts` re-imports it — dependency points the safe direction,
  no auth code moves into shared chunks.]
- **F2 — Playwright cannot route SW-initiated fetches** (page.route/context.route
  intercept page traffic only; SW network interception is behind an
  experimental flag). No existing e2e exercises a waiting worker —
  `offline.spec.ts`/`shell.spec.ts` cover install/claim/offline only. Per the
  run spec's contingency: SW verdict + routing decisions are PURE functions
  unit-tested in isolation; e2e asserts page-observable outcomes (panel states
  via routed page-level fetches, banner, pin surfaces). Toast pre-offer gating
  and pin suppression are unit-tested against fakes in `sw-register` seams.
- **F3 — e2e needs a genuinely signed dist.** The gate's e2e tier runs against
  one `dist/` (esbuild servedir). To make "verified" a real end-to-end state,
  `test:e2e` builds dist signed with the COMMITTED FIXTURE keypair
  (`tests/fixtures/release/`) via the same env seam CI uses
  (`ARECIPE_SIGNING_SEED`); `npm run build` alone stays unsigned (honest local
  posture) and remains in the gate to validate the unsigned path + self-check.
- **F4 — no production pubkey exists yet.** The owner generates the interim
  keypair (runbook one-liners) and installs the seed as an Actions secret;
  until then `src/release/keys.ts` pins `null`. Client behavior with a null
  pin: "signing not yet enabled" = the couldn't-check tier (no banner) — honest,
  and avoids bannering production between merge and secret install. When a
  seed IS present at build time, the build derives the pubkey, bakes its
  fingerprint, and (once keys.ts is non-null) FAILS if it mismatches the
  committed key. The first-deploy checklist covers committing the pubkey.
- **F5 — grounding confirmed:** `build.mjs` version `${date}-${shortSha}` at
  line 180 with an existing SRI/CSP hash toolchain; `sw.ts` special-cases
  `build-info.json` always-network (line 107) and activate-deletes every other
  `arecipe-*` cache; toast consent is session-scoped (SKIP_WAITING);
  `settings.ts` hosts the build-facts block + `check-updates`/`update-status`
  testids (asserted by `nav.spec.ts:55` — assertion migrates with the panel);
  `preview.yml` builds without secrets → previews honestly unsigned.
- **F6 — Ed25519 probes:** Node 22 WebCrypto Ed25519 works (sign/verify/raw
  export green — vitest can run the browser verifier). `@noble/ed25519` v3.1.0
  available as the fallback; loaded via dynamic `import()` so pages keep it out
  of their entry bundles (esbuild splitting), inlined into sw.js. Size delta
  measured in the run summary; >10 KB min+gzip total → FLAG.

## Locked design decisions

D1–D9 as ruled in RUN-SIGNED-RELEASES v2 §3 (manifest shape + canonical JSON;
interim CI key; SW as authoritative verifier with one routing mechanism
`pin > enforcement fallback > normal`; pin = current version only, this-install
only; install-only-verified ON by default with page-layer pre-offer check;
WebCrypto-first verify with noble fallback; Account panel + Settings pointer +
production-only rust banner; docs; deferred list). Adaptations from Phase 0:
path-aware origin classes (F1), pure-function SW coverage + page-observable
e2e (F2), fixture-signed e2e dist (F3), null-pin = "signing not yet enabled"
couldn't-check state (F4).

## Phases

1. **Manifest + sign/verify core** — RED `tests/unit/release/manifest.spec.ts`
   (canonicalization stable/whitespace-free; fixture keypair; node-signed →
   browser-verified vectors; flipped-byte failures; sig:null unsigned;
   buildNumber regression; version mismatch = STALE not invalid). GREEN
   `src/release/manifest.ts` + `src/release/verify.ts` (+ `keys.ts`,
   `origin.ts`); build.mjs emits + signs the manifest, bakes
   `__BUILD_NUMBER__`/fingerprint defines, `--verify-manifest` self-check wired
   into the gate.
2. **CI wiring** — deploy job gets `ARECIPE_SIGNING_SEED`; preview untouched;
   first-deploy checklist carries proof to the first real deploy.
3. **Config + SW verification/routing** — shared IndexedDB config
   (`lockedVersion?`, `requireVerified` default true, `lastVerifiedVersion?`,
   `verdict?`); verdict function (valid / stale-mismatch / unsigned / invalid /
   regression); routing precedence; activate-cleanup exemptions; sw-register
   pre-offer gating + pin suppression.
4. **Panel, migration, banner, stamp** — Account "Release & version" panel;
   Settings pointer; production-only dismissible rust banner (auth-free,
   mounted by nav shell, present on Browse); build-stamp shows the running
   (locked) version under pin. Preserved testids: `check-updates`,
   `update-status`, `build-stamp`.
5. **e2e + closeout** — hermetic e2e per acceptance criteria; mobile-fit;
   docs D8; this Status updated; run summary (red→green per phase,
   verify-in-run outcomes, owner's first-deploy checklist).

## Deferred (Phase 3 of BUILD-PLAN — verbatim from the run spec §D9)

- PDS record publication of the manifest (`app.arecipe.release`).
- Status canary (`app.arecipe.status`).
- Full per-file refuse-mode at install.
- Sigstore transparency rider.
- Offline key ceremony (interim CI key rotates to the ceremony key).
- Multi-origin.

## Outcome Summary

| Phase | Outcome | Note |
|---|---|---|
| 0 Re-ground | ✅ | Findings F1–F6 above; decisions unchanged, three adaptations (path-aware origin classes, pure-SW coverage, fixture-signed e2e dist, null-pin couldn't-check state). |
| 1 Manifest core | ✅ | `src/release/{manifest,verify,keys}.ts`; committed fixtures cross-pin signer/verifier (`tests/fixtures/release/`, independent generator); build.mjs emits+signs, `--verify-manifest` self-check in the gate and in-process after every build (tamper + missing-when-expected proven to exit 1). |
| 2 CI wiring | ✅ | Deploy job env `ARECIPE_SIGNING_SEED` (empty → honest unsigned, nothing breaks); preview.yml untouched; runbook `docs/RELEASE-SIGNING.md` with first-deploy checklist + threat table. |
| 3 Config + SW | ✅ | `release/config.ts` (IDB, page+SW, device-local), pure `routing.ts` (pin > enforcement > normal; cleanup exemptions; activate verdicts a/b/c), `update-gate.ts` (toast gating); sw.ts thin wiring (claim-first activate self-verify with 10s bound, override fetch routing, META/CONFIG_CHANGED messages, manifest always-network). |
| 4 Panel + banner | ✅ | Account "Release & version" panel (all states honest, interim named); Settings pointer (`release-pointer`); rust banner via nav shell, production-only, session-dismissible; stamp shows locked version under pin. Testids `check-updates`/`update-status`/`build-facts`/`build-stamp` preserved. |
| 5 e2e + docs | ✅ | `tests/e2e/release.spec.ts` (8 tests: states, pin round-trip, racing deploy quiet, production banner via routed origin, loopback logs); mobile-fit panel tap targets ≥44px; D8 docs (BUILD-PLAN naming + increment note, LEXICONS planned rows, runbook). |

### Deliberately-changed assertions

- `tests/e2e/nav.spec.ts` — "settings page: app management…" asserted
  `build-facts` on Settings; now asserts the `release-pointer` (link to
  account.html) there instead, since the build block migrated to the Account
  panel (which the release suite asserts). Reason: D7 migration, accepted
  default.
- `tests/e2e/mobile-fit.spec.ts` — the settings readiness selector
  `[data-testid=build-facts]` → `[data-testid=release-pointer]` (same
  migration).

### [verify-in-run] outcomes

- **authModeFor extraction (§2):** lives at `src/auth/oauth-client.ts:37`;
  `PRODUCTION_ORIGIN`/`isLoopbackHostname` moved to auth-free
  `src/release/origin.ts`, re-exported from oauth-client. Bundle-split guard
  stays green; no auth code entered shared chunks.
- **SW e2e probe (Phase 0):** Playwright cannot route SW-initiated fetches
  (page/context routes are page-scoped; SW interception is experimental-only).
  As planned, SW verdict/routing shipped as pure functions with 54 unit tests;
  e2e asserts page-observable outcomes. The e2e dist is fixture-signed
  (`build:e2e`) so "verified" is a real end-to-end state including the SW's
  own activate self-verify.
- **noble delta (D6): FLAGGED — over the 10 KB min budget in raw total, but
  never eagerly loaded in pages.** `@noble/ed25519` is a dynamic import: pages
  ship it as a lazy chunk (8,093 B min / 4,056 B gz) fetched ONLY if WebCrypto
  Ed25519 is missing; the SW bundle inlines it (no splitting in the SW build).
  Measured against main: sw.js 3,109 → 17,354 B min (1,323 → 7,519 B gz) —
  that delta includes manifest+verify+config+routing, not just noble; browse
  9,147 → 10,399 B min (3,827 → 4,214 B gz, banner + verify core, noble NOT
  loaded). Decision kept per D6 (the fallback exists so the ON-default never
  silently no-ops); if the SW inline weight bothers later, the candidate cut
  is SW-side WebCrypto-only with `crypto-unavailable` → couldn't-check.
