# RUN-ANDROID-TWA — run summary (2026-07-18)

Packaged arecipe as an Android app: a Trusted Web Activity shell over the
live `https://arecipe.app`, released as a sideloadable APK via a
tag-triggered GitHub Actions workflow to GitHub Releases. Plan:
`plans/2026-07-18-1-plan-android-twa.md`. Runbook: `docs/ANDROID-APP.md`.

Gate green at every phase boundary; final: lint · typecheck ·
**621 unit** (12 new) · build · **193 hermetic e2e** (2 new, mobile-fit
re-run after the Account layout change).

## Red → green per phase

| Phase | Red (failing first) | Green |
|---|---|---|
| 1 assetlinks | `tests/unit/android/assetlinks.spec.ts` (missing files), `tests/e2e/assetlinks.spec.ts` | `assetlinks.json` (root) + `android/expected-cert-sha256.txt` (placeholder) + build.mjs writes `dist/.well-known/assetlinks.json` |
| 2 config+version | `tests/unit/android/version.spec.ts` (module absent), `twa-manifest.spec.ts` (file absent) | `scripts/version.mjs` (+`.d.mts`), `twa-manifest.json`; build.mjs now consumes `displayVersion` (output unchanged) |
| 3 workflow | `tests/unit/android/stamp.spec.ts` | `stampTwaVersions` + `scripts/stamp-twa-version.mjs` + `scripts/android-build.sh` + `.github/workflows/android-release.yml` + release-notes template |
| 4 affordance+docs | `tests/unit/account/android-app.spec.ts`, `tests/e2e/android-link.spec.ts` | `src/account/android-app.ts` wired into Account; `docs/ANDROID-APP.md`; README line |

## FINDINGS (contradictions with grounding)

1. **The "just shipped" release machinery does not exist on main.** The
   brief grounded on a monotonic `buildNumber` from
   `git rev-list --count HEAD` and a `RELEASE-SIGNING.md` ceremony doc;
   neither is in the tree (`git grep rev-list` empty). Consequence: the
   version-derivation helper was built fresh (`scripts/version.mjs`) as the
   ONE implementation — consumers today are the web build (versionName
   format) and the Android build (versionCode + versionName); a future
   release-manifest run should consume it too, not re-derive.
2. **Bubblewrap's on-disk versionName field is `appVersion`, not
   `appVersionName`** (the in-memory class uses the latter — easy to
   ground wrong). Verified against `@bubblewrap/core@1.24.1`
   `TwaManifestJson`; the committed config and stamping use `appVersion`.

## [verify-in-run] outcomes

- **Package id `app.arecipe.twa` accepted; generation from the committed
  config works headlessly.** Ran the pinned `@bubblewrap/cli@1.24.1
  update --skipVersionUpgrade` against `twa-manifest.json` in a scratch
  dir: full Android project generated, `app/build.gradle` carries
  `applicationId "app.arecipe.twa"`, `versionCode 52` /
  `versionName "2026.07.18-4d74c3c"` (stamped by
  `scripts/stamp-twa-version.mjs`), launcher + maskable icons fetched from
  the live origin, `manifest-checksum.txt` written (which is what makes the
  subsequent `bubblewrap build` prompt-free). Non-interactive password
  path confirmed in CLI source: `BUBBLEWRAP_KEYSTORE_PASSWORD` /
  `BUBBLEWRAP_KEY_PASSWORD`; JDK/SDK paths pre-written to
  `~/.bubblewrap/config.json` (prompt otherwise).
- **NOT executable here (no Android SDK): the gradle build/sign step** —
  `bubblewrap build`, apksigner verification, and APK output names
  (`app-release-signed.apk`, verified in CLI source) are exercised only up
  to script review + the dry-run workflow path. First-release checklist
  covers proving them in CI.
- **esbuild's dev server serves the dotted directory** —
  `/.well-known/assetlinks.json` → 200 in the e2e webserver. **GitHub
  Pages serving it is still a post-deploy TODO**: after this merges,
  `curl -sI https://arecipe.app/.well-known/assetlinks.json` must return
  200 with a JSON-ish content type (Pages is expected to serve dotted
  dirs when `.nojekyll` is present, as it is; record the probe result
  here). Checklist item 5.
- **Version derivation**: `versionCode = git rev-list --count HEAD` = 52
  on this branch at build time; monotonic on ff-only main;
  `versionCodeFrom` rejects garbage/0/overflow loudly. Display version
  output byte-identical to the previous inline build.mjs derivation
  (build log format unchanged).

## Owner's first-release checklist (in order)

1. **Generate the keystore** on your machine — exact `keytool` one-liner in
   `docs/ANDROID-APP.md` § ceremony step 1. Make the **two offline
   backups** (step 5) immediately; key loss orphans every install.
2. **Install the three Actions secrets**: `ANDROID_KEYSTORE_BASE64`,
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`.
3. **Stamp the real fingerprint** (ceremony steps 2–3): replace the
   all-zero placeholder in `android/expected-cert-sha256.txt` AND
   `assetlinks.json` (`npm test` fails until they agree — that's the
   point). Merge to main.
4. **Confirm the live probe**:
   `curl -sI https://arecipe.app/.well-known/assetlinks.json` → 200.
   Record status + content-type in this file.
5. **Optional but recommended: dry-run the pipeline** — Actions →
   android-release → Run workflow (on main) with `dry_run` checked. This
   proves gate → Bubblewrap generate → gradle build → sign → certificate
   check in CI without publishing. First CI-only surprises (SDK licenses,
   JDK config) surface here, not on the tag.
6. **Tag**: `git tag android-v1 && git push origin android-v1`. Confirm
   the release appears with `arecipe.apk` + `SHA256SUMS` + the install
   notes, and that the Account page's "Get the Android app" link now
   downloads it.
7. **On-device**: install the released APK on a real Android device.
   Confirm it opens **full-screen with no browser UI** (asset links
   verified — browser toolbars visible = fingerprint mismatch, diagnostic
   in `docs/ANDROID-APP.md`), and that a Chrome-signed-in session is
   shared with the app. Then confirm a subsequent web deploy shows up in
   the app with no new APK.

## Deferred (verbatim from the brief)

Google Play publication (AAB, Play App Signing — note it would CHANGE the
signing fingerprint story and require an assetlinks entry addition, which
the two-fingerprint-capable file shape does not preclude); iOS anything;
in-app update prompts for the shell; F-Droid.
