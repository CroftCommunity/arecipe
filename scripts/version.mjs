// Version derivation (plan 2026-07-18-1 D4) — the ONE implementation shared
// by the web build (scripts/build.mjs: display version in the SW +
// build-info.json) and the Android TWA build (scripts/android-build.sh via
// `node -e`: versionName + versionCode). Pure over injected inputs; the
// callers own the `git` invocations.

/** Display version: UTC date + short sha, e.g. "2026.07.18-37026bc". */
export const displayVersion = (now, sha) =>
  `${now.toISOString().slice(0, 10).replaceAll('-', '.')}-${sha}`;

// Android's versionCode ceiling (Play + platform): 2100000000.
const VERSION_CODE_MAX = 2100000000;

/**
 * Android versionCode from `git rev-list --count HEAD` output: the commit
 * count is monotonic on a fast-forward-only main, which is exactly what
 * "every release's versionCode exceeds the last" needs. Fails loud on
 * anything that is not a plain positive integer in range — a broken git
 * call must never ship versionCode NaN/0.
 */
/**
 * Return a copy of a twa-manifest.json object with the derived versions
 * stamped in. Bubblewrap's on-disk field for versionName is `appVersion`
 * (verified against @bubblewrap/core@1.24.1 TwaManifestJson). Non-mutating:
 * the committed manifest is never rewritten — the Android build stamps a
 * copy in its scratch dir.
 */
export const stampTwaVersions = (manifest, versionCode, versionName) => ({
  ...manifest,
  appVersionCode: versionCode,
  appVersion: versionName,
});

export const versionCodeFrom = (revListCountOutput) => {
  const trimmed = String(revListCountOutput).trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`versionCode: expected a bare integer from rev-list, got ${JSON.stringify(revListCountOutput)}`);
  }
  const code = Number(trimmed);
  if (code < 1 || code > VERSION_CODE_MAX) {
    throw new Error(`versionCode ${code} outside Android's valid range [1, ${VERSION_CODE_MAX}]`);
  }
  return code;
};
