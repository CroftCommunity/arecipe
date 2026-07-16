// The page-layer update gate (signed releases D4/D5): consulted by
// sw-register BEFORE the update toast is offered. The pin suppresses all
// offers outright; install-only-verified (ON by default) additionally
// verifies the incoming build's manifest and withholds the offer from
// unsigned/invalid/uncheckable builds. "No pinned key" (signing not yet
// enabled on this build) offers normally — verification cannot gate what it
// cannot check, and blocking there would strand pre-rollout installs.

import type { ReleaseConfig } from './config.js';
import type { VerifyOutcome } from './verify.js';

export type UpdateGateDeps = {
  loadConfig: () => Promise<ReleaseConfig>;
  /** The origin-manifest check for the incoming build (checkOriginManifest
   * with this page's pinned pubkey + running meta when available). */
  checkManifest: () => Promise<VerifyOutcome>;
};

export type UpdateGateResult = {
  offer: boolean;
  reason: 'pinned' | 'verified' | 'not-enabled' | 'warn-only' | 'unsigned' | 'invalid' | 'unchecked';
};

export const shouldOfferUpdate = async (deps: UpdateGateDeps): Promise<UpdateGateResult> => {
  const cfg = await deps.loadConfig();
  if (cfg.lockedVersion !== undefined) return { offer: false, reason: 'pinned' };
  if (!cfg.requireVerified) return { offer: true, reason: 'warn-only' };
  const outcome = await deps.checkManifest();
  switch (outcome.state) {
    case 'verified':
    case 'stale-mismatch': // a signed NEWER build — exactly what an update is
      return { offer: true, reason: 'verified' };
    case 'unchecked':
      return outcome.reason === 'no-pinned-key'
        ? { offer: true, reason: 'not-enabled' }
        : { offer: false, reason: 'unchecked' };
    case 'unsigned':
      return { offer: false, reason: 'unsigned' };
    case 'invalid':
      return { offer: false, reason: 'invalid' };
  }
};
