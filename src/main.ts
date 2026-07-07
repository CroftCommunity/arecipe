// SPIKE (Phase 0 / D3): promoted scaffold, not yet under TDD.
// Phase 1 wraps this in real tests before it ships.
// Purpose: prove the vanilla+esbuild+Vitest+Playwright harness can exercise
// the app shell, a service worker, and IndexedDB — the three platform pieces
// every later phase leans on.

import { shellTitle } from './shell.js';

const IDB_NAME = 'arecipe-spike';
const IDB_STORE = 'probe';

const idbRoundTrip = async (): Promise<string> => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put('idb-ok', 'probe-key');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return new Promise<string>((resolve, reject) => {
    const req = db
      .transaction(IDB_STORE, 'readonly')
      .objectStore(IDB_STORE)
      .get('probe-key');
    req.onsuccess = () => resolve(String(req.result));
    req.onerror = () => reject(req.error);
  });
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  app.innerHTML = `
    <h1>${shellTitle(0)}</h1>
    <p data-testid="idb-status">idb: pending</p>
    <p data-testid="sw-status">sw: pending</p>
  `;

  const idbStatus = app.querySelector('[data-testid="idb-status"]');
  const swStatus = app.querySelector('[data-testid="sw-status"]');
  if (idbStatus === null || swStatus === null) throw new Error('probe elements missing');

  // IndexedDB probe — fail loud in the UI so the e2e assertion catches it.
  try {
    idbStatus.textContent = `idb: ${await idbRoundTrip()}`;
  } catch (err) {
    idbStatus.textContent = `idb: FAILED ${String(err)}`;
  }

  // Service-worker probe.
  try {
    await navigator.serviceWorker.register('./sw.js');
    const reg = await navigator.serviceWorker.ready;
    swStatus.textContent = `sw: ${reg.active !== null ? 'active' : 'FAILED no active worker'}`;
  } catch (err) {
    swStatus.textContent = `sw: FAILED ${String(err)}`;
  }
};

void main();
