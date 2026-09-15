// Signed releases Phase 3 (RED first): the page-layer update gate — the
// pre-offer check that runs before the update toast is shown (D5), plus the
// pin's toast suppression (D4). All deps injected (config load + manifest
// check as fakes); the sw-register wiring that consumes this is guarded by
// e2e at the page-observable level.
import { describe, expect, it } from 'vitest';
import type { ReleaseConfig } from '../../../src/release/config.js';
import { shouldOfferUpdate } from '../../../src/release/update-gate.js';
import type { VerifyOutcome } from '../../../src/release/verify.js';
import type { ReleaseManifest } from '../../../src/release/manifest.js';

const manifest: ReleaseManifest = {
  buildNumber: 2,
  version: 'newer-v',
  builtAt: 't',
  files: {},
  pubkeyFingerprint: 'fp',
  sig: 'sig',
};

const deps = (cfg: Partial<ReleaseConfig>, outcome: VerifyOutcome) => ({
  loadConfig: () => Promise.resolve({ requireVerified: true, ...cfg }),
  checkManifest: () => Promise.resolve(outcome),
});

describe('shouldOfferUpdate', () => {
  it('pinned → never offered, no manifest check even attempted (D4)', async () => {
    let checked = false;
    const gate = await shouldOfferUpdate({
      loadConfig: () => Promise.resolve({ requireVerified: true, lockedVersion: 'v1' }),
      checkManifest: () => {
        checked = true;
        return Promise.resolve<VerifyOutcome>({ state: 'verified', manifest });
      },
    });
    expect(gate.offer).toBe(false);
    expect(gate.reason).toBe('pinned');
    expect(checked).toBe(false);
  });

  it('a signed newer build (stale-mismatch vs the running build) is offered', async () => {
    const gate = await shouldOfferUpdate(deps({}, { state: 'stale-mismatch', manifest }));
    expect(gate).toEqual({ offer: true, reason: 'verified' });
  });

  it('verified (same version — e.g. a re-check) is offered', async () => {
    const gate = await shouldOfferUpdate(deps({}, { state: 'verified', manifest }));
    expect(gate.offer).toBe(true);
  });

  it('an UNSIGNED incoming build is not offered while install-only-verified is ON (D5)', async () => {
    const gate = await shouldOfferUpdate(
      deps({}, { state: 'unsigned', manifest: { ...manifest, sig: null } }),
    );
    expect(gate).toEqual({ offer: false, reason: 'unsigned' });
  });

  it('an INVALID manifest is not offered while ON', async () => {
    const gate = await shouldOfferUpdate(deps({}, { state: 'invalid', reason: 'bad-signature' }));
    expect(gate).toEqual({ offer: false, reason: 'invalid' });
  });

  it('couldn\'t-check (fetch failed) is not offered while ON — the next visit retries', async () => {
    const gate = await shouldOfferUpdate(deps({}, { state: 'unchecked', reason: 'fetch-failed' }));
    expect(gate).toEqual({ offer: false, reason: 'unchecked' });
  });

  it('no pinned key (signing not yet enabled) offers normally — verification cannot gate what it cannot check', async () => {
    const gate = await shouldOfferUpdate(deps({}, { state: 'unchecked', reason: 'no-pinned-key' }));
    expect(gate).toEqual({ offer: true, reason: 'not-enabled' });
  });

  it('install-only-verified OFF → warn-only: offered without blocking, even unsigned', async () => {
    const gate = await shouldOfferUpdate(
      deps({ requireVerified: false }, { state: 'unsigned', manifest: { ...manifest, sig: null } }),
    );
    expect(gate.offer).toBe(true);
    expect(gate.reason).toBe('warn-only');
  });

  it('pin still suppresses even with install-only-verified OFF', async () => {
    const gate = await shouldOfferUpdate(
      deps({ requireVerified: false, lockedVersion: 'v1' }, { state: 'verified', manifest }),
    );
    expect(gate.offer).toBe(false);
  });
});
