# Signed releases v2 — signed manifests + verified-install default + version pin

**Status:** 🚧 in progress (2026-07-16).

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

_To be completed at closeout._
