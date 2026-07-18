#!/usr/bin/env bash
# Headless Android TWA build (plan 2026-07-18-1 D3–D6): generate the Android
# project from the committed twa-manifest.json with a PINNED Bubblewrap,
# stamp derived versions, build + sign a universal APK, then FAIL unless the
# signing certificate matches the committed expected fingerprint (the same
# constant the assetlinks gate tests pin — one source of truth, so an APK
# the live site's /.well-known/assetlinks.json won't verify can never ship).
#
# Everything happens in a scratch dir (.android-build/, gitignored): the
# generated android tree is disposable and the committed twa-manifest.json
# is never rewritten.
#
# Requirements (CI: .github/workflows/android-release.yml):
#   - JAVA_HOME → a JDK 17 (Bubblewrap's supported toolchain)
#   - ANDROID_HOME → an Android SDK (runner-preinstalled; Bubblewrap installs
#     missing build-tools itself via sdkmanager)
#   - ./android.keystore in the repo root (decoded from the Actions secret)
#   - BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD exported
#     (Bubblewrap's own non-interactive password env vars)
set -euo pipefail

BUBBLEWRAP="@bubblewrap/cli@1.24.1" # the pin (D3) — bump deliberately, in one place
WORK=".android-build"
ROOT="$(pwd)"

# Bubblewrap reads jdkPath/androidSdkPath from ~/.bubblewrap/config.json and
# PROMPTS (blocking CI) when it's absent — pre-write it from the environment.
if [ ! -f "$HOME/.bubblewrap/config.json" ]; then
  : "${JAVA_HOME:?JAVA_HOME must point at a JDK 17}"
  : "${ANDROID_HOME:?ANDROID_HOME must point at an Android SDK}"
  mkdir -p "$HOME/.bubblewrap"
  printf '{"jdkPath": "%s", "androidSdkPath": "%s"}\n' "$JAVA_HOME" "$ANDROID_HOME" \
    > "$HOME/.bubblewrap/config.json"
fi

rm -rf "$WORK"
mkdir -p "$WORK"

# Stamped COPY of the manifest (D4): versionCode = rev-list count,
# versionName = the shared date-sha display version.
node scripts/stamp-twa-version.mjs "$WORK/twa-manifest.json"

# The manifest's signingKey.path is ./android.keystore relative to the
# project dir; the workflow decodes the secret to the repo root.
cp android.keystore "$WORK/android.keystore"

cd "$WORK"
# `update` regenerates the whole TWA project from twa-manifest.json (and
# writes manifest-checksum.txt, so `build` below runs prompt-free).
# --skipVersionUpgrade: versions are already stamped, never auto-bumped.
npx --yes "$BUBBLEWRAP" update --skipVersionUpgrade
npx --yes "$BUBBLEWRAP" build

# Certificate gate (D5): normalize both sides to bare lowercase hex —
# the committed constant is apksigner's colon-separated uppercase form,
# `apksigner verify --print-certs` prints bare lowercase.
APKSIGNER="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)/apksigner"
expected="$(tr -d ':' < "$ROOT/android/expected-cert-sha256.txt" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
actual="$("$APKSIGNER" verify --print-certs app-release-signed.apk \
  | sed -n 's/.*SHA-256 digest: //p' | head -1 | tr -d '[:space:]')"
if [ "$actual" != "$expected" ]; then
  echo "FATAL: APK signing certificate does not match android/expected-cert-sha256.txt" >&2
  echo "  expected: $expected" >&2
  echo "  actual:   $actual" >&2
  echo "The live site's assetlinks.json pins the expected fingerprint — an APK" >&2
  echo "signed with any other key would install but render with browser UI" >&2
  echo "(TWA verification failure). Wrong keystore, or a rotation that skipped" >&2
  echo "the docs/ANDROID-APP.md fingerprint-update ceremony." >&2
  exit 1
fi
echo "certificate fingerprint matches android/expected-cert-sha256.txt"

# Stable artifact names for the GitHub Release (D6).
cp app-release-signed.apk arecipe.apk
sha256sum arecipe.apk > SHA256SUMS
echo "built $(du -h arecipe.apk | cut -f1) arecipe.apk in $WORK/"
