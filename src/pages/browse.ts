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
import { renderRecipeList, type RenderOptions } from '../recipes/view.js';
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
  // Toolbar bar: controls (added by later phases) on the left, the count
  // block pushed right. The count carries a link to the Settings dietary
  // section — diet is a persisted preference set there, not a Browse filter.
  const toolbar = el('div', 'browse-toolbar');
  const countBlock = el('div', 'browse-count');
  const dietLink = el('a', 'diet-pref-link', 'set dietary preference ↗') as HTMLAnchorElement;
  dietLink.href = './settings.html#diet-preference';
  countBlock.append(recipesStatus, dietLink);
  toolbar.append(countBlock);
  const listContainer = el('div');
  form.append(input, findButton);
  content.append(form, toolbar, listContainer);

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
  const withoutHidden = (entries: CachedRecipe[]): CachedRecipe[] =>
    entries.filter((e) => !exclusions.isHidden(e.uri));

  // The single render seam: both the handle-search path and the starter feed
  // set `current` and call `renderCurrent()`, so every later toggle/filter
  // re-renders whichever list is showing — no refetch. `current` holds enough
  // to rebuild the status line and list on demand. The two paths emit two
  // different status strings (search "N recipes cached", starter "N starter
  // pack recipes" + failed/offline suffixes), so `kind` discriminates.
  type Current = {
    entries: CachedRecipe[];
    kind: 'search' | 'starter';
    author?: string;
    authorsByDid?: Record<string, string>;
    fetchedCount?: number; // search: total records fetched (may exceed shown)
    statusSuffix?: string; // starter: " — X unavailable" / " · showing saved copies"
  };
  let current: Current | null = null;

  const renderCurrent = (): void => {
    if (current === null) return;
    const kept = withoutHidden(current.entries);
    const verified = kept.filter((e) => e.verified).length;
    recipesStatus.textContent =
      current.kind === 'search'
        ? `${current.fetchedCount ?? current.entries.length} recipes cached (${verified} verified)`
        : `${kept.length} starter pack recipes (${verified} verified)${current.statusSuffix ?? ''}`;
    const options: RenderOptions = {};
    if (current.author !== undefined) options.author = current.author;
    if (current.authorsByDid !== undefined) options.authorsByDid = current.authorsByDid;
    listContainer.replaceChildren(renderRecipeList(kept, options));
    log.debug('browse', 'render', {
      kind: current.kind,
      shown: kept.length,
      total: current.entries.length,
    });
  };

  const showEntries = (entries: CachedRecipe[], author: string, fetchedCount?: number): void => {
    current = { entries, kind: 'search', author, fetchedCount };
    renderCurrent();
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
    const failed =
      feed.failedAuthors.length === 0 ? '' : ` — ${feed.failedAuthors.join(', ')} unavailable`;
    const offline =
      feed.cachedAuthors.length === 0 ? '' : ` · showing saved copies (offline)`;
    current = {
      entries: feed.entries,
      kind: 'starter',
      authorsByDid: feed.authorsByDid,
      statusSuffix: `${failed}${offline}`,
    };
    renderCurrent();
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
