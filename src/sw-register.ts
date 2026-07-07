// Service-worker registration, shared by every page (observable via
// src/log.ts — see tests/e2e/shell.spec.ts).

import { log } from './log.js';

export const registerServiceWorker = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) {
    log.warn('sw', 'service workers unsupported in this browser');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      log.info('sw', 'update found', { state: reg.installing?.state ?? 'unknown' });
    });
    await navigator.serviceWorker.ready;
    log.info('sw', 'registered', { scope: reg.scope });
  } catch (err) {
    log.error('sw', 'registration failed', { error: String(err) });
  }
};
