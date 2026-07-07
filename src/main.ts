// App entry: mounts the shell and registers the service worker.
// Wiring proven by tests/e2e/shell.spec.ts against the built bundle.

import { log } from './log.js';
import { shellTitle } from './shell.js';

const registerServiceWorker = async (): Promise<void> => {
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

const main = (): void => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const title = document.createElement('h1');
  title.textContent = shellTitle(0);
  app.replaceChildren(title);
  log.debug('shell', 'mounted');

  void registerServiceWorker();
};

main();
