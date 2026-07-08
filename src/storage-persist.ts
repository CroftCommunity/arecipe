// navigator.storage.persist() request (Phase 8): asks the browser not to
// evict our IndexedDB under pressure. Commonly denied (esp. headless/CI) —
// request, log the answer, never assert it. PDS draft sync is the real
// eviction survival; this just improves the odds locally.

import { log } from './log.js';

export const requestPersistence = async (): Promise<void> => {
  try {
    if (!('storage' in navigator) || navigator.storage.persist === undefined) {
      log.debug('storage', 'persistence API unavailable');
      return;
    }
    const granted = await navigator.storage.persist();
    log.info('storage', 'persistence requested', { granted });
  } catch (err) {
    log.warn('storage', 'persistence request failed', { error: String(err) });
  }
};
