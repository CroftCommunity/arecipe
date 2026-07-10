// Browse page: handle in, verified recipe cards out. This document ships
// ZERO auth code (enforced by the bundle-split e2e test) — the public read
// path needs no session (D2). The view/filter control bar is the shared
// renderToolbar (Phase 7); Browse owns the search form, starter feed, diet
// preference, and version collapse.

import { mountBuildStamp } from '../build-stamp.js';
import { createResolver, type ResolvedIdentity } from '../identity/resolve.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { createExclusions } from '../recipes/exclusions.js';
import { collapseVersions } from '../recipes/model.js';
import { createStarterPrefs, loadStarterFeed } from '../recipes/starter.js';
import { createRecipeReader } from '../recipes/read.js';
import { createDietPreference } from '../recipes/diet-preference.js';
import { availableFacets, createBrowsePrefs, matchesFilter, type BrowseState } from './browse-state.js';
import { renderToolbar } from '../recipes/toolbar.js';
import { renderRecipeDetailsList, renderRecipeList, type RenderOptions } from '../recipes/view.js';
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
  const listContainer = el('div');

  // Persisted transient browse state (view/photos-only/facets) and the app-wide
  // diet preference (set in Settings, read here). renderCurrent applies both.
  const browsePrefs = createBrowsePrefs(); // prefix 'browse' (default) — keys unchanged
  const dietPreference = createDietPreference();
  let state: BrowseState = browsePrefs.load();

  // Only the newest action may render: slow async loads (the starter feed) must
  // never clobber a faster user search that superseded them.
  let generation = 0;

  const exclusions = createExclusions();
  const withoutHidden = (entries: CachedRecipe[]): CachedRecipe[] =>
    entries.filter((e) => !exclusions.isHidden(e.uri));

  // The single render seam: both the handle-search path and the starter feed set
  // `current` and call showCurrent()/renderCurrent(). The two paths emit two
  // different status strings, so `kind` discriminates.
  type Current = {
    entries: CachedRecipe[];
    kind: 'search' | 'starter';
    author?: string;
    authorsByDid?: Record<string, string>;
    fetchedCount?: number; // search: total records fetched (may exceed shown)
    statusSuffix?: string; // starter: " — X unavailable" / " · showing saved copies"
  };
  let current: Current | null = null;

  // Selected facets that no longer exist in the current feed are kept in state
  // (so they re-apply when the user returns) but treated as inert here.
  const effectiveState = (): BrowseState => {
    const available =
      current === null ? { cuisine: [], category: [] } : availableFacets(withoutHidden(current.entries));
    return {
      view: state.view,
      photosOnly: state.photosOnly,
      facets: {
        cuisine: state.facets.cuisine.filter((c) => available.cuisine.includes(c)),
        category: state.facets.category.filter((c) => available.category.includes(c)),
      },
    };
  };

  const isFiltered = (s: BrowseState, diet: string[]): boolean =>
    s.photosOnly || s.facets.cuisine.length > 0 || s.facets.category.length > 0 || diet.length > 0;

  // Browse-owned filters only (photos + facets) — the reset control's scope. Diet
  // is the Settings-owned app-wide preference, deliberately excluded.
  const hasBrowseFilters = (s: BrowseState): boolean =>
    s.photosOnly || s.facets.cuisine.length > 0 || s.facets.category.length > 0;

  const renderCurrent = (): void => {
    if (current === null) return;
    const kept = withoutHidden(current.entries);
    const diet = dietPreference.load();
    const effective = effectiveState();
    const shown = kept.filter((e) => matchesFilter(e.value, { state: effective, diet }));
    const verified = shown.filter((e) => e.verified).length;
    // When a filter is active the honest count is "N of M shown"; with no filter
    // the original per-path string is preserved byte-identical.
    toolbar.setStatus(
      isFiltered(effective, diet)
        ? `${shown.length} of ${kept.length} shown`
        : current.kind === 'search'
          ? `${current.fetchedCount ?? current.entries.length} recipes cached (${verified} verified)`
          : `${kept.length} starter pack recipes (${verified} verified)${current.statusSuffix ?? ''}`,
    );
    toolbar.setResetVisible(hasBrowseFilters(effective));
    const options: RenderOptions = {};
    if (current.author !== undefined) options.author = current.author;
    if (current.authorsByDid !== undefined) options.authorsByDid = current.authorsByDid;
    // Collapse alternative versions to one card per dish (with a "N versions"
    // badge linking to the compare grid); single recipes are untouched.
    const { representatives, counts } = collapseVersions(shown);
    options.versionCounts = counts;
    const render = state.view === 'details' ? renderRecipeDetailsList : renderRecipeList;
    listContainer.replaceChildren(render(representatives, options));
    log.debug('browse', 'render', {
      kind: current.kind,
      view: state.view,
      shown: shown.length,
      total: kept.length,
      filtered: isFiltered(effective, diet),
    });
  };

  // Rebuild the facet dropdowns from the current feed's available facets. Called
  // when `current` changes (feed vs search) — NOT on a facet checkbox change.
  const rebuildToolbarFacets = (): void => {
    const available =
      current === null ? { cuisine: [], category: [] } : availableFacets(withoutHidden(current.entries));
    toolbar.rebuildFacets(available, state.facets);
  };

  // Show the current list: rebuild the (feed-dependent) facet dropdowns, then
  // render. Toggle handlers call renderCurrent() directly (no rebuild).
  const showCurrent = (): void => {
    rebuildToolbarFacets();
    renderCurrent();
  };

  const setView = (view: BrowseState['view']): void => {
    if (state.view === view) return;
    state = { ...state, view };
    browsePrefs.save(state);
    toolbar.reflectView(view);
    log.debug('browse', 'view mode', { view });
    renderCurrent();
  };

  // The shared control bar. Browse shows the diet link; its controls drive the
  // state updates + re-render through these callbacks.
  const toolbar = renderToolbar({
    showDietLink: true,
    callbacks: {
      onViewChange: setView,
      onPhotosToggle: (photosOnly) => {
        state = { ...state, photosOnly };
        browsePrefs.save(state);
        log.debug('browse', 'filter changed', { photosOnly: state.photosOnly });
        renderCurrent();
      },
      onFacetChange: (dimension, value, checked) => {
        const selected = new Set(state.facets[dimension]);
        if (checked) selected.add(value);
        else selected.delete(value);
        state = { ...state, facets: { ...state.facets, [dimension]: [...selected] } };
        browsePrefs.save(state);
        log.debug('browse', 'facets changed', { dimension, selected: [...selected] });
        renderCurrent();
      },
      onReset: () => {
        state = { ...state, photosOnly: false, facets: { cuisine: [], category: [] } };
        browsePrefs.save(state);
        toolbar.setPhotos(false);
        log.info('browse', 'filters reset');
        showCurrent(); // rebuild the (now-empty) facet dropdowns + re-render
      },
    },
  });

  // Initialize the controls from prefs.
  toolbar.setPhotos(state.photosOnly);
  toolbar.reflectView(state.view);

  form.append(input, findButton);
  content.append(form, toolbar.element, listContainer);

  const resolve = createResolver();
  const readRecipes = createRecipeReader();
  const cache = createRecipeCache();

  // Last search survives navigation (5d): opening a recipe page and coming back
  // re-renders the results from the cache — no network, no empty page.
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

  const showEntries = (entries: CachedRecipe[], author: string, fetchedCount?: number): void => {
    current = { entries, kind: 'search', author, fetchedCount };
    showCurrent();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const gen = ++generation;
    toolbar.setStatus('finding…');
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
      if (gen === generation) toolbar.setStatus(message);
    });
  });

  const showStarterFeed = async (): Promise<void> => {
    const gen = generation; // page-load generation; a search supersedes us
    const enabled = createStarterPrefs().enabledAuthors();
    if (enabled.length === 0) {
      toolbar.setStatus('starter pack is off — search a cook above');
      return;
    }
    toolbar.setStatus('loading your starter pack…');
    const feed = await loadStarterFeed(enabled);
    if (gen !== generation) return; // the user searched while we loaded
    const failed =
      feed.failedAuthors.length === 0 ? '' : ` — ${feed.failedAuthors.join(', ')} unavailable`;
    const offline = feed.cachedAuthors.length === 0 ? '' : ` · showing saved copies (offline)`;
    current = {
      entries: feed.entries,
      kind: 'starter',
      authorsByDid: feed.authorsByDid,
      statusSuffix: `${failed}${offline}`,
    };
    showCurrent();
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
      toolbar.setStatus('starter pack unavailable — search a cook above');
    });
  }

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'browse' });
  void registerServiceWorker();
};

main();
