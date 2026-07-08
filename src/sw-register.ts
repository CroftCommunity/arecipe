// Service-worker registration + user-controlled updates (Phase 8b).
// A new worker landing in `waiting` surfaces the update toast; applying
// posts SKIP_WAITING and reloads on controllerchange. Observable via
// src/log.ts — see tests/e2e/shell.spec.ts.

import { log } from './log.js';
import { showUpdateToast } from './update-toast.js';

// Reload only when an update WE applied takes control — clients.claim() on
// a first install also fires controllerchange, and reloading then would
// nuke first-visit state.
let applying = false;

const offerUpdate = (waiting: ServiceWorker): void => {
  log.info('sw', 'update ready — offering toast');
  showUpdateToast(() => {
    applying = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
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
