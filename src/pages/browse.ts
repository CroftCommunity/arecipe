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
import { createDietPreference } from '../recipes/diet-preference.js';
import { availableFacets, createBrowsePrefs, matchesFilter, type BrowseState } from './browse-state.js';
import {
  renderFacetDropdown,
  renderRecipeDetailsList,
  renderRecipeList,
  type RenderOptions,
} from '../recipes/view.js';
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
  const controls = el('div', 'browse-controls');
  // View-mode segmented control (Phase 5): Tiles | Details.
  const viewSegmented = el('div', 'segmented');
  const viewTiles = el('button', 'segmented-option', 'Tiles') as HTMLButtonElement;
  viewTiles.type = 'button';
  viewTiles.dataset['testid'] = 'view-tiles';
  const viewDetails = el('button', 'segmented-option', 'Details') as HTMLButtonElement;
  viewDetails.type = 'button';
  viewDetails.dataset['testid'] = 'view-details';
  viewSegmented.append(viewTiles, viewDetails);
  controls.append(viewSegmented);
  // Photos-only toggle (Phase 3): the first live filter. A styled checkbox
  // pill consistent with .chip.
  const photosToggleLabel = el('label', 'browse-toggle');
  const photosToggle = document.createElement('input');
  photosToggle.type = 'checkbox';
  photosToggle.dataset['testid'] = 'photos-only';
  photosToggleLabel.append(photosToggle, document.createTextNode('Photos only'));
  controls.append(photosToggleLabel);
  // Facet dropdowns (Phase 7): Meal ▾ + Cuisine ▾, rebuilt from the current
  // feed's available facets. Held in their own container so a facet change can
  // refresh the count+list without rebuilding (and collapsing) the dropdowns.
  const facetsContainer = el('div', 'browse-facets');
  controls.append(facetsContainer);
  const countBlock = el('div', 'browse-count');
  // Reset control: shown only when a Browse-owned filter is active, rendered
  // ahead of the count as "reset filters · N of M shown". Clears photos/facets;
  // the diet preference is Settings-owned (see the diet link) and is not reset.
  const resetBtn = el('button', 'reset-filters-link', 'reset filters') as HTMLButtonElement;
  resetBtn.type = 'button';
  resetBtn.dataset['testid'] = 'reset-filters';
  resetBtn.hidden = true;
  const resetSep = el('span', 'reset-sep', '·');
  resetSep.hidden = true;
  const dietLink = el('a', 'diet-pref-link', 'set dietary preference ↗') as HTMLAnchorElement;
  dietLink.href = './settings.html#diet-preference';
  countBlock.append(resetBtn, resetSep, recipesStatus, dietLink);
  toolbar.append(controls, countBlock);
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

  // Persisted transient browse state (view/photos-only/facets) and the
  // app-wide diet preference (set in Settings, read here). renderCurrent
  // applies both so Browse honors the diet preference from this phase on,
  // before the Settings UI (Phase 8) exists.
  const browsePrefs = createBrowsePrefs();
  const dietPreference = createDietPreference();
  let state: BrowseState = browsePrefs.load();

  // Selected facets that no longer exist in the current feed are kept in
  // state (so they re-apply when the user returns to a feed that has them)
  // but treated as inert here — otherwise a stale selection would filter the
  // whole list to nothing after a feed/search switch.
  const effectiveState = (): BrowseState => {
    const available = current === null
      ? { cuisine: [], category: [] }
      : availableFacets(withoutHidden(current.entries));
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

  // Browse-owned filters only (photos + facets) — the reset control's scope.
  // Diet is the Settings-owned app-wide preference, deliberately excluded.
  const hasBrowseFilters = (s: BrowseState): boolean =>
    s.photosOnly || s.facets.cuisine.length > 0 || s.facets.category.length > 0;

  const renderCurrent = (): void => {
    if (current === null) return;
    const kept = withoutHidden(current.entries);
    const diet = dietPreference.load();
    const effective = effectiveState();
    const shown = kept.filter((e) => matchesFilter(e.value, { state: effective, diet }));
    const verified = shown.filter((e) => e.verified).length;
    // When a filter is active the honest count is "N of M shown" (the verified
    // count is dropped here — the reset control takes that slot); with no
    // filter, the original per-path string is preserved byte-identical.
    recipesStatus.textContent = isFiltered(effective, diet)
      ? `${shown.length} of ${kept.length} shown`
      : current.kind === 'search'
        ? `${current.fetchedCount ?? current.entries.length} recipes cached (${verified} verified)`
        : `${kept.length} starter pack recipes (${verified} verified)${current.statusSuffix ?? ''}`;
    // Show the reset control only when there are Browse-owned filters to clear
    // (a diet-only narrowing shows the count but is reset via Settings).
    const showReset = hasBrowseFilters(effective);
    resetBtn.hidden = !showReset;
    resetSep.hidden = !showReset;
    const options: RenderOptions = {};
    if (current.author !== undefined) options.author = current.author;
    if (current.authorsByDid !== undefined) options.authorsByDid = current.authorsByDid;
    const render = state.view === 'details' ? renderRecipeDetailsList : renderRecipeList;
    listContainer.replaceChildren(render(shown, options));
    log.debug('browse', 'render', {
      kind: current.kind,
      view: state.view,
      shown: shown.length,
      total: kept.length,
      filtered: isFiltered(effective, diet),
    });
  };

  // Rebuild the Meal ▾ / Cuisine ▾ dropdowns from the current feed's available
  // facets. Called when `current` changes (feed vs search) — NOT on a facet
  // checkbox change, so the open dropdown survives multi-select.
  const rebuildToolbarFacets = (): void => {
    if (current === null) {
      facetsContainer.replaceChildren();
      return;
    }
    const available = availableFacets(withoutHidden(current.entries));
    const meal = renderFacetDropdown({
      dimension: 'category',
      label: 'Meal',
      available: available.category,
      selected: state.facets.category,
    });
    const cuisine = renderFacetDropdown({
      dimension: 'cuisine',
      label: 'Cuisine',
      available: available.cuisine,
      selected: state.facets.cuisine,
    });
    const dropdowns = [meal, cuisine].filter((n): n is HTMLElement => n !== null);
    facetsContainer.replaceChildren(...dropdowns);
  };

  // Show the current list: rebuild the (feed-dependent) facet dropdowns, then
  // render. Toggle handlers call renderCurrent() directly (no rebuild).
  const showCurrent = (): void => {
    rebuildToolbarFacets();
    renderCurrent();
  };

  // Facet checkbox change (event-delegated): update state, persist, and
  // refresh only the count + list — leave the dropdown open and intact.
  facetsContainer.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
    const dimension = target.dataset['dimension'];
    const value = target.dataset['value'];
    if ((dimension !== 'cuisine' && dimension !== 'category') || value === undefined) return;
    const selected = new Set(state.facets[dimension]);
    if (target.checked) selected.add(value);
    else selected.delete(value);
    state = { ...state, facets: { ...state.facets, [dimension]: [...selected] } };
    browsePrefs.save(state);
    log.debug('browse', 'facets changed', { dimension, selected: [...selected] });
    renderCurrent();
  });

  // Close an open facet dropdown when clicking outside it.
  document.addEventListener('click', (event) => {
    for (const dd of facetsContainer.querySelectorAll<HTMLDetailsElement>(
      'details.facet-dd[open]',
    )) {
      if (!dd.contains(event.target as Node)) dd.removeAttribute('open');
    }
  });

  // Reflect the active view on the segmented control (aria-pressed + class).
  const reflectViewControl = (): void => {
    for (const [btn, mode] of [
      [viewTiles, 'tiles'],
      [viewDetails, 'details'],
    ] as const) {
      const active = state.view === mode;
      btn.classList.toggle('segmented-option--active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  };

  // Initialize the controls from prefs and re-render on change.
  photosToggle.checked = state.photosOnly;
  photosToggle.addEventListener('change', () => {
    state = { ...state, photosOnly: photosToggle.checked };
    browsePrefs.save(state);
    log.debug('browse', 'filter changed', { photosOnly: state.photosOnly });
    renderCurrent();
  });

  const setView = (view: BrowseState['view']): void => {
    if (state.view === view) return;
    state = { ...state, view };
    browsePrefs.save(state);
    reflectViewControl();
    log.debug('browse', 'view mode', { view });
    renderCurrent();
  };
  viewTiles.addEventListener('click', () => setView('tiles'));
  viewDetails.addEventListener('click', () => setView('details'));
  reflectViewControl();

  // Reset the Browse-owned filters (photos + facets) back to none; view mode
  // and the Settings diet preference are left untouched.
  resetBtn.addEventListener('click', () => {
    state = { ...state, photosOnly: false, facets: { cuisine: [], category: [] } };
    browsePrefs.save(state);
    photosToggle.checked = false;
    log.info('browse', 'filters reset');
    showCurrent(); // rebuild the (now-empty) facet dropdowns + re-render
  });

  const showEntries = (entries: CachedRecipe[], author: string, fetchedCount?: number): void => {
    current = { entries, kind: 'search', author, fetchedCount };
    showCurrent();
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
      recipesStatus.textContent = 'starter pack unavailable — search a cook above';
    });
  }

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'browse' });
  void registerServiceWorker();
};

main();
