# The Android app — TWA packaging, signing, and release runbook

arecipe ships as an Android app built from this repo: a **Trusted Web
Activity** (TWA) — the live `https://arecipe.app` rendered by the device's
Chrome engine, full-screen, on the real origin. Plan:
`plans/2026-07-18-1-plan-android-twa.md`.

Because the app IS the site in the real browser, everything carries over
unchanged: the service worker, origin-bound OAuth sign-in (shared with
Chrome), and every deploy of the site updates the app's content with **no
new APK**. The APK is a thin shell (~hundreds of KB); shell releases are
occasional and decoupled from web releases.

Distribution is **GitHub Releases** (sideload), not Google Play. Play is
deferred — see "Deferred: Google Play" below for what would change.

## How the pieces fit

| Piece | Where | What it does |
|---|---|---|
| `assetlinks.json` | repo root → `dist/.well-known/assetlinks.json` | Digital Asset Links: tells Android this app and this origin trust each other |
| `android/expected-cert-sha256.txt` | repo | THE fingerprint constant — single source of truth |
| `twa-manifest.json` | repo root | Bubblewrap project config (identity, colors, icons); Android project is generated from it in CI, never committed |
| `scripts/version.mjs` + `scripts/stamp-twa-version.mjs` | repo | versionCode = `git rev-list --count HEAD`; versionName = the web date-sha version |
| `scripts/android-build.sh` | repo | Headless generate → stamp → build → sign → **verify certificate** |
| `.github/workflows/android-release.yml` | repo | Tag `android-v*` → gate → build → verify → GitHub Release |
| `android/release-notes-template.md` | repo | The release body (install/sideload notes) |

Android verifies a TWA by fetching
`https://arecipe.app/.well-known/assetlinks.json` and comparing the
`sha256_cert_fingerprints` entry against the certificate that signed the
installed APK. **Match → full-screen app. Mismatch → the site opens as a
Custom Tab with visible browser UI.** That's the failure signature; see
"Diagnosing" below.

Three things must therefore always agree, and the repo enforces it from the
one committed constant `android/expected-cert-sha256.txt`:

1. the served `assetlinks.json` — gate tests
   (`tests/unit/android/assetlinks.spec.ts`, `tests/e2e/assetlinks.spec.ts`)
   fail if it desyncs from the constant;
2. the APK's signing certificate — `scripts/android-build.sh` fails the
   release workflow if `apksigner verify --print-certs` disagrees with the
   constant;
3. the keystore in Actions secrets — it's what produces (2).

## One-time owner ceremony: the release keystore

The keystore is the app's identity. **Android only accepts updates signed
with the same key** — losing it means existing installs can never update in
place (users would have to uninstall and reinstall; a new key also means a
new fingerprint everywhere). Treat backup as part of generation, not an
afterthought.

### 1. Generate (on your machine, never in the repo)

```bash
keytool -genkeypair \
  -keystore arecipe-android.keystore -alias arecipe \
  -keyalg RSA -keysize 4096 -validity 9125 \
  -dname "CN=arecipe, O=CroftCommunity"
```

Pick a strong keystore password (you'll be prompted; reusing it as the key
password is fine — the workflow carries both as separate secrets).

### 2. Read the certificate fingerprint

```bash
keytool -list -v -keystore arecipe-android.keystore -alias arecipe \
  | grep 'SHA256:'
```

Copy the value after `SHA256:` — colon-separated uppercase hex pairs,
e.g. `AB:CD:…` (32 pairs).

### 3. Stamp it into the repo (ONE place)

Replace the contents of `android/expected-cert-sha256.txt` with that
fingerprint, then update `assetlinks.json`'s
`sha256_cert_fingerprints[0]` to the identical string. Run `npm test` —
the gate fails unless the two agree. Merge to main and wait for the deploy,
then confirm the live site serves it:

```bash
curl -s https://arecipe.app/.well-known/assetlinks.json
```

### 4. Install the Actions secrets

```bash
base64 -w0 arecipe-android.keystore   # macOS: base64 -i arecipe-android.keystore
```

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the base64 output above |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_PASSWORD` | key password (alias `arecipe`) |

### 5. Back up — two offline copies

Copy `arecipe-android.keystore` (plus a note of the passwords, stored
separately) to **two offline locations** (e.g. a USB drive in a drawer and
a password-manager attachment). The Actions secret is NOT a backup — it
can't be read back out. Key loss = every existing install orphaned.

### Why this key is separate from other signing

This keystore signs **the Android shell only**. Any future release-manifest
/ web-release signing (an Ed25519 story) serves a different trust boundary
— what the *site* ships — and rotates on a different schedule with
different blast radius. One key per boundary; losing or rotating one must
never touch the other.

## Cutting a release

```bash
git tag android-v1 && git push origin android-v1
```

`android-release.yml` then runs: the full gate → headless Bubblewrap build
(pinned `@bubblewrap/cli@1.24.1`, JDK 17, versions stamped from git) →
certificate check → GitHub Release with `arecipe.apk` (stable asset name),
`SHA256SUMS`, and the install-notes body. The Account page's "Get the
Android app" link (`…/releases/latest/download/arecipe.apk`) picks it up
with no site change.

To prove the pipeline without publishing: Actions → android-release →
Run workflow → check **dry_run** (builds and verifies, skips the release).
A branch dispatch is inherently dry — publishing requires a tag ref.

## Rotation (avoid if possible)

A new keystore means a new fingerprint: existing installs stop updating
(same-key rule) and, the moment `assetlinks.json` changes, **already
installed apps signed with the old key lose TWA verification** and fall
back to browser-UI mode. If you must rotate: repeat the ceremony, and
*add* the new fingerprint to `sha256_cert_fingerprints` alongside the old
one (the array exists for exactly this) so old installs keep verifying;
update `android/expected-cert-sha256.txt` to the new fingerprint (it pins
what NEW releases must be signed with). Expect users of old installs to
reinstall for updates. Announce it in the release body.

## Diagnosing "the app shows browser UI"

That's a Digital Asset Links verification failure — the installed APK's
certificate doesn't match what the live site serves. Check, in order:

1. `curl -s https://arecipe.app/.well-known/assetlinks.json` — served?
   fingerprint present and correctly formatted?
2. `keytool -printcert -jarfile arecipe.apk | grep SHA256` on the released
   APK — does it match (1)?
3. Recently rotated? Old installs verify only if the old fingerprint is
   still in the served array (see Rotation).
4. On-device: `chrome://flags` "Enable command line on non-rooted devices"
   aside, the practical reset is clearing Chrome's storage for the site or
   reinstalling the APK after fixing (1)/(2).

## Deferred: Google Play

Play publication would need an AAB (`bubblewrap build` can produce one) and
**Play App Signing**, which re-signs with a Google-held key — a *different*
fingerprint that must be **added** to `assetlinks.json`'s array (the
sideload fingerprint stays for GitHub-release installs). Nothing in the
current setup precludes this; it's additive.
