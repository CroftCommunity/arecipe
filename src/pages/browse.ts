// Browse page: handle in, verified recipe cards out. This document ships
// ZERO auth code (enforced by the bundle-split e2e test) — the public read
// path needs no session (D2).

import { mountBuildStamp } from '../build-stamp.js';
import { createResolver, type ResolvedIdentity } from '../identity/resolve.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { createExclusions } from '../recipes/exclusions.js';
import { createStarterPrefs, loadStarterFeed } from '../recipes/starter.js';
import { createRecipeReader } from '../recipes/read.js';
import { renderRecipeList } from '../recipes/view.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const main = (): void => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  const form = el('form', 'lookup') as HTMLFormElement;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'a cook’s handle — try rdur.dev';
  input.dataset['testid'] = 'handle-input';
  const findButton = el('button', 'button button--primary', 'Find recipes') as HTMLButtonElement;
  findButton.type = 'submit';
  findButton.dataset['testid'] = 'find-recipes';
  const recipesStatus = el('p', 'status');
  recipesStatus.dataset['testid'] = 'recipes-status';
  const listContainer = el('div');
  form.append(input, findButton);
  content.append(form, recipesStatus, listContainer);

  const resolve = createResolver();
  const readRecipes = createRecipeReader();
  const cache = createRecipeCache();

  // Last search survives navigation (5d): opening a recipe page and coming
  // back re-renders the results from the cache — no network, no empty page.
  // Defensive storage access (Safari private mode).
  type LastFind = { handle: string; uris: string[] };
  const saveLastFind = (value: LastFind): void => {
    try {
      window.sessionStorage.setItem('last-find', JSON.stringify(value));
    } catch {
      /* private mode: back-restore unavailable */
    }
  };
  const readLastFind = (): LastFind | null => {
    try {
      const raw = window.sessionStorage.getItem('last-find');
      return raw === null ? null : (JSON.parse(raw) as LastFind);
    } catch {
      return null;
    }
  };

  // Only the newest action may render: slow async loads (the starter feed)
  // must never clobber a faster user search that superseded them. Every
  // renderer checks its generation before touching the DOM.
  let generation = 0;

  const exclusions = createExclusions();
  const withoutHidden = (entries: CachedRecipe[]): { kept: CachedRecipe[]; hidden: number } => {
    const kept = entries.filter((e) => !exclusions.isHidden(e.uri));
    return { kept, hidden: entries.length - kept.length };
  };
  const hiddenNote = (hidden: number): string => (hidden === 0 ? '' : ` · ${hidden} hidden`);

  const showEntries = (entries: CachedRecipe[], author: string, fetchedCount?: number): void => {
    const { kept, hidden } = withoutHidden(entries);
    const verified = kept.filter((e) => e.verified).length;
    recipesStatus.textContent = `${fetchedCount ?? entries.length} recipes cached (${verified} verified)${hiddenNote(hidden)}`;
    listContainer.replaceChildren(renderRecipeList(kept, { author }));
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const gen = ++generation;
    recipesStatus.textContent = 'finding…';
    void (async () => {
      const identity: ResolvedIdentity = await resolve(input.value.trim());
      const records = await readRecipes({ pds: identity.pds, did: identity.did });
      const entries = await Promise.all(records.map((r) => cache.put(r)));
      saveLastFind({ handle: identity.handle, uris: entries.map((e) => e.uri) });
      if (gen !== generation) return; // superseded
      showEntries(entries, identity.handle, records.length);
    })().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error('recipes', 'find failed', { error: message });
      if (gen === generation) recipesStatus.textContent = message;
    });
  });

  const showStarterFeed = async (): Promise<void> => {
    const gen = generation; // page-load generation; a search supersedes us
    const enabled = createStarterPrefs().enabledAuthors();
    if (enabled.length === 0) {
      recipesStatus.textContent = 'starter pack is off — search a cook above';
      return;
    }
    recipesStatus.textContent = 'loading your starter pack…';
    const feed = await loadStarterFeed(enabled);
    if (gen !== generation) return; // the user searched while we loaded
    const { kept, hidden } = withoutHidden(feed.entries);
    const verified = kept.filter((e) => e.verified).length;
    const failed =
      feed.failedAuthors.length === 0 ? '' : ` — ${feed.failedAuthors.join(', ')} unavailable`;
    recipesStatus.textContent = `${kept.length} starter pack recipes (${verified} verified)${failed}${hiddenNote(hidden)}`;
    listContainer.replaceChildren(renderRecipeList(kept, { authorsByDid: feed.authorsByDid }));
  };

  const last = readLastFind();
  if (last !== null) {
    input.value = last.handle;
    void (async () => {
      const entries = (await Promise.all(last.uris.map((u) => cache.get(u)))).filter(
        (e): e is NonNullable<typeof e> => e !== undefined,
      );
      if (entries.length > 0) showEntries(entries, last.handle);
      else await showStarterFeed();
    })().catch((err: unknown) => {
      log.warn('recipes', 'last-search restore failed', { error: String(err) });
    });
  } else {
    void showStarterFeed().catch((err: unknown) => {
      log.warn('starter', 'starter feed failed', { error: String(err) });
      recipesStatus.textContent = 'starter pack unavailable — search a cook above';
    });
  }

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'browse' });
  void registerServiceWorker();
};

main();
