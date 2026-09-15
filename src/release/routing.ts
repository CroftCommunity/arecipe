// The service worker's release decisions as PURE functions (signed releases
// D3/D4): Playwright cannot intercept SW-initiated fetches, so everything the
// SW decides — which cache serves content, which caches survive activate
// cleanup, what verdict an activate-time self-verify records — is proven at
// this layer and the sw.ts wiring stays thin.

import type { ReleaseConfig } from './config.js';
import type { VerifyOutcome } from './verify.js';

const BAD_STATES = new Set(['unsigned', 'invalid']);

/** Which version's cache should serve content instead of the current one.
 * Precedence: pin > enforcement fallback > normal (null). The enforcement
 * fallback applies only when the verdict is BAD (unsigned/invalid — never
 * couldn't-check or a racing deploy) and is ABOUT the running version, so a
 * stale verdict left by an older SW can never lock a healthy install. */
export const overrideVersionFor = (cfg: ReleaseConfig, currentVersion: string): string | null => {
  if (cfg.lockedVersion !== undefined) return cfg.lockedVersion;
  if (
    cfg.requireVerified &&
    cfg.verdict !== undefined &&
    BAD_STATES.has(cfg.verdict.state) &&
    cfg.verdict.version === currentVersion &&
    cfg.lastVerifiedVersion !== undefined &&
    cfg.lastVerifiedVersion !== currentVersion
  ) {
    return cfg.lastVerifiedVersion;
  }
  return null;
};

/** Activate cleanup with exemptions: the locked cache and the last verified
 * cache must SURVIVE version turnover — they are what the pin and the
 * enforcement fallback route to. Non-arecipe caches are never touched. */
export const shouldDeleteCache = (
  name: string,
  currentVersion: string,
  cfg: ReleaseConfig,
): boolean => {
  if (!name.startsWith('arecipe-')) return false;
  const keep = new Set(
    [currentVersion, cfg.lockedVersion, cfg.lastVerifiedVersion]
      .filter((v): v is string => v !== undefined)
      .map((v) => `arecipe-${v}`),
  );
  return !keep.has(name);
};

/** Fold the activate-time self-verify outcome into the config (D3 a/b/c):
 * (a) verified → this version becomes the last verified;
 * (b) stale-mismatch → a deploy raced this install; keep the previous
 *     lastVerifiedVersion, record the quiet verdict, await the next cycle;
 * (c) unsigned/invalid (and unchecked) → record; lastVerifiedVersion is
 *     PRESERVED — it is the enforcement fallback target. */
export const applyActivateOutcome = (
  cfg: ReleaseConfig,
  outcome: VerifyOutcome,
  swVersion: string,
  checkedAt: string,
): ReleaseConfig => {
  const verdict: ReleaseConfig['verdict'] = {
    state: outcome.state,
    ...('reason' in outcome && outcome.reason !== undefined ? { reason: outcome.reason } : {}),
    version: swVersion,
    checkedAt,
  };
  return {
    ...cfg,
    ...(outcome.state === 'verified' ? { lastVerifiedVersion: swVersion } : {}),
    verdict,
  };
};
