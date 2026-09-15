// Service-worker registration + user-controlled updates (Phase 8b).
// A new worker landing in `waiting` surfaces the update toast; applying
// posts SKIP_WAITING and reloads on controllerchange. Observable via
// src/log.ts — see tests/e2e/shell.spec.ts.
//
// Signed releases (D4/D5): the toast is GATED. A version pin suppresses all
// offers; install-only-verified (the default) verifies the incoming build's
// origin manifest first and withholds the offer from unsigned/invalid builds
// — the gate decision logic is unit-tested in release/update-gate.ts.

import { log } from './log.js';
import { bakedPubkeyHex } from './release/build-meta.js';
import { createReleaseConfig } from './release/config.js';
import { requestSwReleaseMeta } from './release/sw-meta.js';
import { shouldOfferUpdate } from './release/update-gate.js';
import { checkOriginManifest } from './release/verify.js';
import { showUpdateToast } from './update-toast.js';

// Reload only when an update WE applied takes control — clients.claim() on
// a first install also fires controllerchange, and reloading then would
// nuke first-visit state.
let applying = false;

const offerUpdate = (waiting: ServiceWorker): void => {
  void (async () => {
    const gate = await shouldOfferUpdate({
      // A broken IDB must not strand the install without updates — degrade to
      // the defaults (no pin; verified-only still checks the manifest).
      loadConfig: () => createReleaseConfig().load().catch(() => ({ requireVerified: true })),
      checkManifest: async () => {
        const running = await requestSwReleaseMeta();
        return checkOriginManifest({
          pubkeyHex: bakedPubkeyHex(),
          ...(running !== null ? { running } : {}),
        });
      },
    });
    if (!gate.offer) {
      // Withheld — the Account panel (and the banner for bad verdicts) carry
      // the explanation; pinned installs stay silent by design.
      const say = gate.reason === 'pinned' ? log.info : log.warn;
      say('sw', 'update ready but withheld', { reason: gate.reason });
      return;
    }
    log.info('sw', 'update ready — offering toast', { reason: gate.reason });
    showUpdateToast(() => {
      applying = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    });
  })().catch((err: unknown) => {
    log.error('sw', 'update gate failed', { error: String(err) });
  });
};

export const registerServiceWorker = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) {
    log.warn('sw', 'service workers unsupported in this browser');
    return;
  }
  try {
    // Apply-then-reload: when the waiting worker takes over AFTER the user
    // accepted the toast, pick up the new shell exactly once.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!applying || reloading) return;
      reloading = true;
      window.location.reload();
    });

    const reg = await navigator.serviceWorker.register('./sw.js');
    // A worker may already be waiting from a previous visit.
    if (reg.waiting !== null && navigator.serviceWorker.controller !== null) {
      offerUpdate(reg.waiting);
    }
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      log.info('sw', 'update found', { state: installing?.state ?? 'unknown' });
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller !== null) {
          offerUpdate(installing);
        }
      });
    });
    await navigator.serviceWorker.ready;
    log.info('sw', 'registered', { scope: reg.scope });
  } catch (err) {
    log.error('sw', 'registration failed', { error: String(err) });
  }
};
