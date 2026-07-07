// App entry: mounts the shell (title + sign-in form), restores any OAuth
// session, and registers the service worker. Wiring proven by
// tests/e2e/*.spec.ts against the built bundle (@live tier for OAuth).

import type { Agent } from '@atproto/api';
import { createOAuthClient } from './auth/oauth-client.js';
import { createOAuthSessionProvider, type SessionProvider } from './auth/session-provider.js';
import { createResolver, type ResolvedIdentity } from './identity/resolve.js';
import { isDebugEnabled, log } from './log.js';
import { createRecipeCache } from './recipes/cache.js';
import { createRecipeReader } from './recipes/read.js';
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

const mountSignIn = (app: HTMLElement, provider: SessionProvider): void => {
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'your.handle (e.g. name.bsky.social)';
  input.dataset['testid'] = 'handle-input';
  const resolveButton = document.createElement('button');
  resolveButton.type = 'submit';
  resolveButton.textContent = 'Resolve';
  resolveButton.dataset['testid'] = 'resolve-submit';
  const signInButton = document.createElement('button');
  signInButton.type = 'button';
  signInButton.textContent = 'Sign in';
  signInButton.dataset['testid'] = 'oauth-signin';
  const status = document.createElement('p');
  status.dataset['testid'] = 'resolved-pds';
  const loadButton = document.createElement('button');
  loadButton.type = 'button';
  loadButton.textContent = 'Load recipes';
  loadButton.dataset['testid'] = 'load-recipes';
  loadButton.hidden = true;
  const recipesStatus = document.createElement('p');
  recipesStatus.dataset['testid'] = 'recipes-status';
  form.append(input, resolveButton, signInButton);
  app.append(form, status, loadButton, recipesStatus);

  const resolve = createResolver();
  let resolved: ResolvedIdentity | null = null;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    status.textContent = 'resolving…';
    loadButton.hidden = true;
    void resolve(input.value.trim())
      .then((identity) => {
        resolved = identity;
        status.textContent = `PDS: ${identity.pds}`;
        loadButton.hidden = false;
      })
      .catch((err: unknown) => {
        status.textContent = err instanceof Error ? err.message : String(err);
      });
  });

  const readRecipes = createRecipeReader();
  const cache = createRecipeCache();
  loadButton.addEventListener('click', () => {
    if (resolved === null) return;
    const target = resolved;
    recipesStatus.textContent = 'loading…';
    void (async () => {
      const records = await readRecipes({ pds: target.pds, did: target.did });
      const entries = await Promise.all(records.map((r) => cache.put(r)));
      const verified = entries.filter((e) => e.verified).length;
      recipesStatus.textContent = `${records.length} recipes cached (${verified} verified)`;
    })().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error('recipes', 'load failed', { error: message });
      recipesStatus.textContent = `load failed: ${message}`;
    });
  });
  signInButton.addEventListener('click', () => {
    status.textContent = 'redirecting to sign-in…';
    // Resolves only on failure/abort — success navigates away.
    void provider.signIn(input.value.trim()).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error('auth', 'sign-in failed', { error: message });
      status.textContent = `sign-in failed: ${message}`;
    });
  });
};

const mountSignedIn = (app: HTMLElement, agent: Agent, provider: SessionProvider): void => {
  const who = document.createElement('p');
  who.dataset['testid'] = 'signed-in-did';
  who.textContent = `Signed in: ${agent.did ?? 'unknown'}`;
  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.textContent = 'Sign out';
  signOut.dataset['testid'] = 'sign-out';
  signOut.addEventListener('click', () => {
    void provider.signOut().then(() => window.location.reload());
  });
  app.append(who, signOut);
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const title = document.createElement('h1');
  title.textContent = shellTitle(0);
  app.replaceChildren(title);

  const provider = createOAuthSessionProvider({ client: createOAuthClient() });
  let agent: Agent | null = null;
  try {
    agent = await provider.restore();
  } catch (err) {
    log.error('auth', 'session restore failed', { error: String(err) });
  }

  if (agent === null) mountSignIn(app, provider);
  else mountSignedIn(app, agent, provider);
  log.debug('shell', 'mounted', { signedIn: agent !== null });

  // Debug console surface (?debug=1): lets a field debugger — and the 3b
  // two-tab regression test — force a token refresh on demand.
  if (isDebugEnabled(window.location.search, window.localStorage.getItem('debug'))) {
    (window as Window & { arecipeDebug?: unknown }).arecipeDebug = {
      forceRefresh: provider.forceRefresh,
    };
  }

  void registerServiceWorker();
};

void main();
