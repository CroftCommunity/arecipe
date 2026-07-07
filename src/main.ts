// App entry: mounts the shell (title + sign-in form) and registers the
// service worker. Wiring proven by tests/e2e/*.spec.ts against the built
// bundle.

import { createResolver } from './identity/resolve.js';
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

const mountSignIn = (app: HTMLElement): void => {
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'your.handle (e.g. name.bsky.social)';
  input.dataset['testid'] = 'handle-input';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Sign in';
  submit.dataset['testid'] = 'resolve-submit';
  const status = document.createElement('p');
  status.dataset['testid'] = 'resolved-pds';
  form.append(input, submit);
  app.append(form, status);

  const resolve = createResolver();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    status.textContent = 'resolving…';
    void resolve(input.value.trim())
      .then((identity) => {
        status.textContent = `PDS: ${identity.pds}`;
      })
      .catch((err: unknown) => {
        status.textContent = err instanceof Error ? err.message : String(err);
      });
  });
};

const main = (): void => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const title = document.createElement('h1');
  title.textContent = shellTitle(0);
  app.replaceChildren(title);
  mountSignIn(app);
  log.debug('shell', 'mounted');

  void registerServiceWorker();
};

main();
