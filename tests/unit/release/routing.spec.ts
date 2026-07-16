// Signed releases Phase 3 (RED first): the PURE service-worker decision
// functions — Playwright cannot intercept SW-initiated fetches, so the SW's
// verdict recording, fetch-routing precedence, and activate-cleanup exemptions
// are proven here in isolation and the SW wiring stays thin (plan F2).
//
// Routing precedence (D3, one mechanism, two triggers):
//   pin (lockedVersion) > enforcement fallback (requireVerified + bad verdict
//   for the RUNNING version + a lastVerifiedVersion to fall back to) > normal.
import { describe, expect, it } from 'vitest';
import type { ReleaseConfig } from '../../../src/release/config.js';
import {
  applyActivateOutcome,
  overrideVersionFor,
  shouldDeleteCache,
} from '../../../src/release/routing.js';
import type { VerifyOutcome } from '../../../src/release/verify.js';
import type { ReleaseManifest } from '../../../src/release/manifest.js';

const CURRENT = '2026.07.17-new1';
const OLDER = '2026.07.16-old1';

const base: ReleaseConfig = { requireVerified: true };
const badVerdict = (version: string): ReleaseConfig['verdict'] => ({
  state: 'invalid',
  reason: 'bad-signature',
  version,
  checkedAt: 't',
});

describe('overrideVersionFor (fetch-routing precedence)', () => {
  it('normal: no pin, no bad verdict → null', () => {
    expect(overrideVersionFor(base, CURRENT)).toBeNull();
    expect(
      overrideVersionFor(
        { ...base, verdict: { state: 'verified', version: CURRENT, checkedAt: 't' } },
        CURRENT,
      ),
    ).toBeNull();
  });

  it('pin wins over everything, even a bad verdict fallback', () => {
    const cfg: ReleaseConfig = {
      requireVerified: true,
      lockedVersion: OLDER,
      lastVerifiedVersion: 'some-other',
      verdict: badVerdict(CURRENT),
    };
    expect(overrideVersionFor(cfg, CURRENT)).toBe(OLDER);
  });

  it('pin equal to the running version routes to that same cache (harmless identity)', () => {
    expect(overrideVersionFor({ ...base, lockedVersion: CURRENT }, CURRENT)).toBe(CURRENT);
  });

  it('enforcement: bad verdict for the RUNNING version + lastVerified → the last verified cache', () => {
    const cfg: ReleaseConfig = {
      requireVerified: true,
      lastVerifiedVersion: OLDER,
      verdict: badVerdict(CURRENT),
    };
    expect(overrideVersionFor(cfg, CURRENT)).toBe(OLDER);
  });

  it('enforcement is OFF when requireVerified is false (warn-only)', () => {
    const cfg: ReleaseConfig = {
      requireVerified: false,
      lastVerifiedVersion: OLDER,
      verdict: badVerdict(CURRENT),
    };
    expect(overrideVersionFor(cfg, CURRENT)).toBeNull();
  });

  it('a stale verdict about a DIFFERENT version never triggers enforcement', () => {
    const cfg: ReleaseConfig = {
      requireVerified: true,
      lastVerifiedVersion: OLDER,
      verdict: badVerdict('some-third-version'),
    };
    expect(overrideVersionFor(cfg, CURRENT)).toBeNull();
  });

  it('unchecked and stale-mismatch verdicts never trigger enforcement (couldn\'t-check ≠ bad)', () => {
    for (const state of ['unchecked', 'stale-mismatch'] as const) {
      const cfg: ReleaseConfig = {
        requireVerified: true,
        lastVerifiedVersion: OLDER,
        verdict: { state, version: CURRENT, checkedAt: 't' },
      };
      expect(overrideVersionFor(cfg, CURRENT)).toBeNull();
    }
  });

  it('enforcement without a lastVerifiedVersion has nothing to route to → null', () => {
    const cfg: ReleaseConfig = { requireVerified: true, verdict: badVerdict(CURRENT) };
    expect(overrideVersionFor(cfg, CURRENT)).toBeNull();
  });

  it('unsigned counts as a bad verdict for enforcement too', () => {
    const cfg: ReleaseConfig = {
      requireVerified: true,
      lastVerifiedVersion: OLDER,
      verdict: { state: 'unsigned', version: CURRENT, checkedAt: 't' },
    };
    expect(overrideVersionFor(cfg, CURRENT)).toBe(OLDER);
  });
});

describe('shouldDeleteCache (activate cleanup exemptions)', () => {
  it('deletes older arecipe caches but keeps current, locked, and lastVerified', () => {
    const cfg: ReleaseConfig = {
      requireVerified: true,
      lockedVersion: 'pinned-v',
      lastVerifiedVersion: OLDER,
    };
    expect(shouldDeleteCache(`arecipe-${CURRENT}`, CURRENT, cfg)).toBe(false);
    expect(shouldDeleteCache('arecipe-pinned-v', CURRENT, cfg)).toBe(false);
    expect(shouldDeleteCache(`arecipe-${OLDER}`, CURRENT, cfg)).toBe(false);
    expect(shouldDeleteCache('arecipe-something-ancient', CURRENT, cfg)).toBe(true);
  });

  it('never touches non-arecipe caches', () => {
    expect(shouldDeleteCache('workbox-whatever', CURRENT, base)).toBe(false);
  });

  it('without exemptions set, only the current cache survives (existing behavior)', () => {
    expect(shouldDeleteCache(`arecipe-${OLDER}`, CURRENT, base)).toBe(true);
    expect(shouldDeleteCache(`arecipe-${CURRENT}`, CURRENT, base)).toBe(false);
  });
});

describe('applyActivateOutcome (the SW self-verify at activate, D3 a/b/c)', () => {
  const manifest = (version: string, buildNumber: number): ReleaseManifest => ({
    buildNumber,
    version,
    builtAt: 't',
    files: {},
    pubkeyFingerprint: 'fp',
    sig: 'sig',
  });
  const at = '2026-07-16T12:00:00.000Z';

  it('(a) verified → records the verdict and advances lastVerifiedVersion to itself', () => {
    const outcome: VerifyOutcome = { state: 'verified', manifest: manifest(CURRENT, 2) };
    const next = applyActivateOutcome({ ...base, lastVerifiedVersion: OLDER }, outcome, CURRENT, at);
    expect(next.lastVerifiedVersion).toBe(CURRENT);
    expect(next.verdict).toEqual({ state: 'verified', version: CURRENT, checkedAt: at });
  });

  it('(b) stale-mismatch (a racing deploy) → keeps the previous lastVerifiedVersion, quiet verdict', () => {
    const outcome: VerifyOutcome = { state: 'stale-mismatch', manifest: manifest('even-newer', 3) };
    const next = applyActivateOutcome({ ...base, lastVerifiedVersion: OLDER }, outcome, CURRENT, at);
    expect(next.lastVerifiedVersion).toBe(OLDER);
    expect(next.verdict?.state).toBe('stale-mismatch');
  });

  it('(c) invalid → records the bad verdict, PRESERVES lastVerifiedVersion (the fallback target)', () => {
    const outcome: VerifyOutcome = { state: 'invalid', reason: 'bad-signature' };
    const next = applyActivateOutcome({ ...base, lastVerifiedVersion: OLDER }, outcome, CURRENT, at);
    expect(next.lastVerifiedVersion).toBe(OLDER);
    expect(next.verdict).toEqual({
      state: 'invalid',
      reason: 'bad-signature',
      version: CURRENT,
      checkedAt: at,
    });
  });

  it('(c) unsigned → bad verdict recorded the same way', () => {
    const outcome: VerifyOutcome = {
      state: 'unsigned',
      manifest: { ...manifest(CURRENT, 2), sig: null },
    };
    const next = applyActivateOutcome(base, outcome, CURRENT, at);
    expect(next.verdict?.state).toBe('unsigned');
  });

  it('unchecked (offline / no key) → recorded with its reason, nothing else disturbed', () => {
    const outcome: VerifyOutcome = { state: 'unchecked', reason: 'fetch-failed' };
    const next = applyActivateOutcome(
      { ...base, lockedVersion: 'pin-v', lastVerifiedVersion: OLDER },
      outcome,
      CURRENT,
      at,
    );
    expect(next.verdict).toEqual({
      state: 'unchecked',
      reason: 'fetch-failed',
      version: CURRENT,
      checkedAt: at,
    });
    expect(next.lockedVersion).toBe('pin-v');
    expect(next.lastVerifiedVersion).toBe(OLDER);
  });
});
