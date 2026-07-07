// App entry: header (wordmark + auth), Browse / My recipes tabs, service
// worker, build stamp. Wiring proven by tests/e2e/*.spec.ts against the
// built bundle (@live tier for OAuth).

import type { Agent } from '@atproto/api';
import { mountBuildStamp } from './build-stamp.js';
import { createOAuthClient, isLoopbackHostname } from './auth/oauth-client.js';
import { createOAuthSessionProvider, type SessionProvider } from './auth/session-provider.js';
import { createResolver, type ResolvedIdentity } from './identity/resolve.js';
import { isDebugEnabled, log } from './log.js';
import { createRecipeCache } from './recipes/cache.js';
import { createRecipeReader } from './recipes/read.js';
import { renderRecipeList } from './recipes/view.js';

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

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const mountBrowse = (panel: HTMLElement, provider: SessionProvider | null): void => {
  const form = el('form', 'lookup') as HTMLFormElement;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'a cook’s handle — try rdur.dev';
  input.dataset['testid'] = 'handle-input';
  const findButton = el('button', 'button button--primary', 'Find recipes') as HTMLButtonElement;
  findButton.type = 'submit';
  findButton.dataset['testid'] = 'find-recipes';
  const signInButton = el('button', 'button', 'Sign in') as HTMLButtonElement;
  signInButton.type = 'button';
  signInButton.dataset['testid'] = 'oauth-signin';
  const recipesStatus = el('p', 'status');
  recipesStatus.dataset['testid'] = 'recipes-status';
  const listContainer = el('div');
  form.append(input, findButton, signInButton);
  panel.append(form, recipesStatus, listContainer);

  // One action: handle in, recipes out. Resolution details (DID, PDS) are
  // console diagnostics via the resolver's own logging, not UI.
  const resolve = createResolver();
  const readRecipes = createRecipeReader();
  const cache = createRecipeCache();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    recipesStatus.textContent = 'finding…';
    void (async () => {
      const identity: ResolvedIdentity = await resolve(input.value.trim());
      const records = await readRecipes({ pds: identity.pds, did: identity.did });
      const entries = await Promise.all(records.map((r) => cache.put(r)));
      const verified = entries.filter((e) => e.verified).length;
      recipesStatus.textContent = `${records.length} recipes cached (${verified} verified)`;
      listContainer.replaceChildren(renderRecipeList(entries));
    })().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error('recipes', 'find failed', { error: message });
      recipesStatus.textContent = message;
    });
  });

  if (provider === null) {
    // Deployed origin: sign-in arrives with the hosted client (M3).
    signInButton.hidden = true;
  } else {
    const boundProvider = provider;
    signInButton.addEventListener('click', () => {
      recipesStatus.textContent = 'redirecting to sign-in…';
      // Resolves only on failure/abort — success navigates away.
      void boundProvider.signIn(input.value.trim()).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error('auth', 'sign-in failed', { error: message });
        recipesStatus.textContent = `sign-in failed: ${message}`;
      });
    });
  }
};

const mountMine = (panel: HTMLElement, agent: Agent | null): void => {
  const empty = el(
    'p',
    'empty-state',
    agent === null
      ? 'Sign in to keep your recipes here.'
      : 'Your shelf is empty — authoring arrives with the next milestone.',
  );
  empty.dataset['testid'] = 'mine-empty';
  panel.append(empty);
};

const mountAuthArea = (
  area: HTMLElement,
  agent: Agent | null,
  provider: SessionProvider | null,
): void => {
  if (agent === null || provider === null) return;
  const who = el('span', 'auth-who', agent.did ?? 'unknown');
  who.dataset['testid'] = 'signed-in-did';
  const signOut = el('button', 'button', 'Sign out') as HTMLButtonElement;
  signOut.type = 'button';
  signOut.dataset['testid'] = 'sign-out';
  signOut.addEventListener('click', () => {
    void provider.signOut().then(() => window.location.reload());
  });
  area.append(who, signOut);
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const header = el('header', 'topbar');
  const wordmark = el('h1', 'wordmark');
  // Differentiated leading "a" so the wordmark reads "a recipe".
  wordmark.append(el('span', 'wordmark-a', 'a'), document.createTextNode('recipe'));
  header.append(wordmark);
  const authArea = el('div', 'auth-area');
  header.append(authArea);

  const tabs = el('nav', 'tabs');
  const tabBrowse = el('button', 'tab tab--active', 'Browse') as HTMLButtonElement;
  tabBrowse.type = 'button';
  tabBrowse.dataset['testid'] = 'tab-browse';
  const tabMine = el('button', 'tab', 'My recipes') as HTMLButtonElement;
  tabMine.type = 'button';
  tabMine.dataset['testid'] = 'tab-mine';
  tabs.append(tabBrowse, tabMine);

  const browsePanel = el('section', 'panel');
  const minePanel = el('section', 'panel');
  minePanel.hidden = true;
  app.replaceChildren(header, tabs, browsePanel, minePanel);

  const selectTab = (which: 'browse' | 'mine'): void => {
    browsePanel.hidden = which !== 'browse';
    minePanel.hidden = which !== 'mine';
    tabBrowse.classList.toggle('tab--active', which === 'browse');
    tabMine.classList.toggle('tab--active', which === 'mine');
  };
  tabBrowse.addEventListener('click', () => selectTab('browse'));
  tabMine.addEventListener('click', () => selectTab('mine'));

  const provider = isLoopbackHostname(window.location.hostname)
    ? createOAuthSessionProvider({ client: createOAuthClient() })
    : null;
  if (provider === null) {
    log.info('auth', 'deployed origin — sign-in unavailable until the hosted client (M3)', {
      hostname: window.location.hostname,
    });
  }
  let agent: Agent | null = null;
  try {
    agent = (await provider?.restore()) ?? null;
  } catch (err) {
    log.error('auth', 'session restore failed', { error: String(err) });
  }

  mountAuthArea(authArea, agent, provider);
  mountBrowse(browsePanel, agent === null ? provider : null);
  mountMine(minePanel, agent);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { signedIn: agent !== null });

  // Debug console surface (?debug=1): lets a field debugger — and the 3b
  // two-tab regression test — force a token refresh on demand.
  if (
    provider !== null &&
    isDebugEnabled(window.location.search, window.localStorage.getItem('debug'))
  ) {
    (window as Window & { arecipeDebug?: unknown }).arecipeDebug = {
      forceRefresh: provider.forceRefresh,
    };
  }

  void registerServiceWorker();
};

void main();
