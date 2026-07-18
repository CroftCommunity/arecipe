# Android app packaging — Trusted Web Activity → GitHub Releases

**Status:** 🚧 In progress 2026-07-18.

## Mission

Ship arecipe as an installable Android app using a Trusted Web Activity: the
live `https://arecipe.app` rendered by Chrome full-screen on the real origin.
Everything already built carries over unchanged — service worker, version
pin, origin-bound OAuth — because a TWA *is* the real origin in the real
browser engine. The app is a thin shell; web content keeps updating via
normal deploys, so shell releases are occasional and decoupled.

Distribution target is **GitHub Releases** (sideloadable APK), NOT Google
Play. Play publication is Deferred, but nothing here may preclude it.

Deliverables: Digital Asset Links served by the site; a committed,
reproducible TWA build config; a tag-triggered GitHub Actions workflow that
builds, signs, and attaches the APK (checksums + install notes) to a GitHub
Release; a keystore runbook; a "Get the Android app" affordance pointing at
the stable latest-release download URL.

## Grounding findings (Phase 0, 2026-07-18)

- **FINDING — grounding drift:** the run brief claims in-repo release
  machinery "just shipped" (monotonic `buildNumber` from
  `git rev-list --count HEAD`; `RELEASE-SIGNING.md`). Neither exists on
  main (`git grep rev-list` empty; no such doc). The version-derivation
  helper is therefore built fresh here as the single implementation —
  `scripts/build.mjs` becomes its first consumer (date-sha display
  version), the TWA build its second; a future release-manifest run can be
  its third.
- `scripts/build.mjs` is an explicit allowlist copy into `dist/` —
  root statics (`CNAME`, `client-metadata.json`, `.nojekyll`) are
  precedented; `.well-known/assetlinks.json` is one more explicit write.
- `manifest.webmanifest` already carries everything Bubblewrap requires
  (name, short_name, start_url, `display: standalone`, theme/background
  colors, 192+512 icons incl. maskable variants). **No manifest gaps.**
- Gate order is `lint → typecheck → test:unit → build → test:e2e`, so
  unit tests must not read `dist/` (it may be stale/absent). Source-file
  shape assertions live in unit; built/served assertions live in e2e
  (the e2e webserver serves `dist/` via `esbuild --servedir`).
- Environment: JDK 21 + `keytool` present; **no Android SDK** — a full
  Bubblewrap build cannot execute in this run and is a first-release
  checklist item. `@bubblewrap/cli` latest is **1.24.1** (the pin).
- ci.yml conventions to mirror: SHA-pinned actions, node 22, `npm ci`,
  no third-party actions with write access (releases are created with
  first-party `gh` CLI).

## Locked design decisions

- **D1 Package + identity.** Application id `app.arecipe.twa`; launcher
  name "arecipe"; display standalone, default orientation; host locked to
  `https://arecipe.app`.
- **D2 Asset links.** `assetlinks.json` committed at repo root (beside the
  other root statics), copied to `dist/.well-known/assetlinks.json` by
  build.mjs. The release certificate's SHA-256 fingerprint lives in ONE
  committed place — `android/expected-cert-sha256.txt` — and a gate test
  asserts the assetlinks fingerprint equals it, so a keystore rotation
  cannot silently desync the site. The file shape supports multiple
  fingerprints (an array), so a later Play App Signing entry is additive.
  Placeholder (all-zero) fingerprint until the owner's keystore ceremony
  stamps the real one. [verify-in-run: GitHub Pages serving dotted
  directories — probe post-deploy, recorded in the run summary.]
- **D3 Reproducible TWA config.** `twa-manifest.json` committed at repo
  root. The Android project is GENERATED in CI from it with a pinned
  `@bubblewrap/cli@1.24.1` invoked via `npx --yes` — pinned in one place
  (`scripts/android-build.sh`), NOT in package.json devDependencies, so
  the main gate's `npm ci` doesn't pay for the Android toolchain on every
  CI run. The generated `android/` tree is not committed.
- **D4 Versioning.** `versionCode` = `git rev-list --count HEAD` (monotonic
  commit count); `versionName` = the existing date-sha display version.
  One implementation (`scripts/version.mjs`), consumed by build.mjs and
  the Android build; injected at build time, never hand-edited.
- **D5 Signing.** A dedicated Android release keystore generated once by
  the owner (keytool one-liners in docs/ANDROID-APP.md), stored as base64
  Actions secrets, used only in the release workflow. After signing, the
  workflow runs `apksigner verify --print-certs` and FAILS if the
  certificate fingerprint differs from `android/expected-cert-sha256.txt`
  (the same constant the gate test checks). Runbook covers generation,
  backup (two offline copies; key loss = installs orphaned), rotation
  consequences, and why this key is separate from any future
  release-manifest signing key.
- **D6 Release workflow.** `.github/workflows/android-release.yml` on tag
  push `android-v*` + manual dispatch (`dry_run` input builds and verifies
  but skips publishing). Jobs: gate → build (generate from
  twa-manifest.json, stamp D4 versions, build + sign universal APK) →
  verify (fingerprint check per D5) → publish (GitHub Release with stable
  asset name `arecipe.apk`, `SHA256SUMS`, body from the committed template
  `android/release-notes-template.md`). No AAB (Play is Deferred).
- **D7 Site affordance.** "Get the Android app" link on the Account page
  (testid `android-app-link`) pointing at
  `https://github.com/CroftCommunity/arecipe/releases/latest/download/arecipe.apk`,
  shown regardless of platform, phrased for Android.
- **D8 Deferred (verbatim):** Google Play publication (AAB, Play App
  Signing — note it would CHANGE the signing fingerprint story and require
  an assetlinks entry addition, which D2's two-fingerprint-capable file
  shape should not preclude); iOS anything; in-app update prompts for the
  shell; F-Droid.

## Phases

1. **Assetlinks + dist plumbing (red first).** Unit: source
   `assetlinks.json` shape + fingerprint-constant equality/format. E2E:
   `dist/.well-known/assetlinks.json` served, parses, targets
   `app.arecipe.twa`, matches the constant. Green: committed files +
   build.mjs write.
2. **TWA config + version derivation.** Unit: version helpers (rev-list
   count → versionCode; date+sha → versionName) and `twa-manifest.json`
   shape. Green: committed config; build.mjs consumes the shared helper.
3. **Release workflow.** `android-release.yml` per D6 with dry-run path;
   `scripts/android-build.sh` performs generate+stamp+build+verify
   headlessly; exercised here as far as the environment allows (no SDK —
   recorded as first-release checklist items).
4. **Site affordance + docs.** Red: account link presence test. Green:
   link + `docs/ANDROID-APP.md` runbook + README one-liner + release body
   template.
5. **Closeout.** This Status; run summary `RUN-ANDROID-TWA-SUMMARY.md`
   with red→green per phase, verify-in-run outcomes, and the owner's
   first-release checklist.
