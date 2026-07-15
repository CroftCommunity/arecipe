// Browse page: handle in, verified recipe cards out. This document ships
// ZERO auth code (enforced by the bundle-split e2e test) — the public read
// path needs no session (D2). The view/filter control bar is the shared
// renderToolbar (Phase 7); Browse owns the search form, starter feed, diet
// preference, and version collapse.

import { mountBuildStamp } from '../build-stamp.js';
import { attachActorTypeahead } from '../identity/actor-typeahead.js';
import { createResolver, type ResolvedIdentity } from '../identity/resolve.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { createExclusions } from '../recipes/exclusions.js';
import { collapseVersions } from '../recipes/model.js';
import { createStarterPrefs, loadStarterFeed } from '../recipes/starter.js';
import { createRecipeReader } from '../recipes/read.js';
import { createDietPreference } from '../recipes/diet-preference.js';
import { createSearchMemo, queryEntries } from '../recipes/search.js';
import { availableFacets, createBrowsePrefs, matchesFilter, recipeFacets, type BrowseState } from './browse-state.js';
import { createTastePreference, matchesTaste } from '../recipes/taste-preference.js';
import { windowPage } from '../recipes/paginate.js';
import {
  extensionFor,
  mimeFor,
  serializeRecipes,
  type ExportFormat,
  type ExportRecipe,
} from '../recipes/export.js';
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

  // Pagination: the filtered feed can be large (the corpus keeps growing), so
  // window it to a page with ◀ / ▶ arrows rather than rendering everything.
  const BROWSE_PAGE_SIZE = 50;
  let browseOffset = 0;
  const pager = el('div', 'browse-pager');
  pager.dataset['testid'] = 'browse-pager';
  const pagerPrev = el('button', 'palette-page-btn', '◀') as HTMLButtonElement;
  pagerPrev.type = 'button';
  pagerPrev.dataset['testid'] = 'browse-prev';
  pagerPrev.setAttribute('aria-label', 'Previous page');
  const pagerHint = el('span', 'browse-pager-hint');
  const pagerNext = el('button', 'palette-page-btn', '▶') as HTMLButtonElement;
  pagerNext.type = 'button';
  pagerNext.dataset['testid'] = 'browse-next';
  pagerNext.setAttribute('aria-label', 'Next page');
  pager.append(pagerPrev, pagerHint, pagerNext);
  pager.hidden = true;
  pagerPrev.addEventListener('click', () => {
    browseOffset = Math.max(0, browseOffset - BROWSE_PAGE_SIZE);
    renderCurrent();
  });
  pagerNext.addEventListener('click', () => {
    browseOffset += BROWSE_PAGE_SIZE;
    renderCurrent();
  });

  // Persisted transient browse state (view/photos-only/facets) and the app-wide
  // diet preference (set in Settings, read here). renderCurrent applies both.
  const browsePrefs = createBrowsePrefs(); // prefix 'browse' (default) — keys unchanged
  const dietPreference = createDietPreference();
  const tastePreference = createTastePreference();
  let state: BrowseState = browsePrefs.load();

  // Transient text-search query (D7): NOT persisted — navigating away drops it.
  // The MiniSearch index is memoized on the feed's array identity (D6), so facet
  // toggles reuse it and only a feed change rebuilds.
  let query = '';
  const searchMemo = createSearchMemo();

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
    s.photosOnly ||
    s.facets.cuisine.length > 0 ||
    s.facets.category.length > 0 ||
    diet.length > 0 ||
    query.trim() !== '';

  // Browse-owned filters only (photos + facets + text query) — the reset control's
  // scope. Diet is the Settings-owned app-wide preference, deliberately excluded.
  const hasBrowseFilters = (s: BrowseState): boolean =>
    s.photosOnly || s.facets.cuisine.length > 0 || s.facets.category.length > 0 || query.trim() !== '';

  // The filtered result set behind the current view: hidden removed, browse
  // facets + diet applied. renderCurrent renders it; the export action serializes
  // the version-collapsed representatives (what's actually shown as cards).
  const computeShown = (): { kept: CachedRecipe[]; shown: CachedRecipe[]; effective: BrowseState; diet: string[] } => {
    const kept = withoutHidden(current?.entries ?? []);
    const diet = dietPreference.load();
    const effective = effectiveState();
    // The standing taste preference (Only/Never by meal + cuisine) applies on top
    // of the transient facet filters — an app-wide personal default.
    const taste = tastePreference.load();
    const facetFiltered = kept.filter(
      (e) => matchesFilter(e.value, { state: effective, diet }) && matchesTaste(recipeFacets(e.value), taste),
    );
    // Text search runs AFTER the facet/diet/taste filter and BEFORE version
    // collapse (D5): with an active query only matches survive, in score order;
    // an empty query is the identity (facet order preserved). The index is over
    // the whole feed (stable identity) — queryEntries intersects with the
    // facet-filtered candidates.
    const searcher = searchMemo(current?.entries ?? []);
    const shown = queryEntries(searcher, query, facetFiltered);
    return { kept, shown, effective, diet };
  };

  const renderCurrent = (): void => {
    if (current === null) return;
    const { kept, shown, effective, diet } = computeShown();
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
    // Window the collapsed cards to one page; the arrows step through the rest.
    const page = windowPage(representatives, { offset: browseOffset, size: BROWSE_PAGE_SIZE });
    browseOffset = page.total === 0 ? 0 : page.start - 1; // sync to the clamped window
    const paged = page.total > BROWSE_PAGE_SIZE;
    pager.hidden = !paged;
    pagerHint.textContent = paged ? `Showing ${page.start}–${page.end} of ${page.total}` : '';
    pagerPrev.disabled = !page.hasPrev;
    pagerNext.disabled = !page.hasNext;
    const render = state.view === 'details' ? renderRecipeDetailsList : renderRecipeList;
    listContainer.replaceChildren(render(page.items, options));
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
        browseOffset = 0; // the result set changed — back to page 1
        log.debug('browse', 'filter changed', { photosOnly: state.photosOnly });
        renderCurrent();
      },
      onFacetChange: (dimension, value, checked) => {
        const selected = new Set(state.facets[dimension]);
        if (checked) selected.add(value);
        else selected.delete(value);
        state = { ...state, facets: { ...state.facets, [dimension]: [...selected] } };
        browsePrefs.save(state);
        browseOffset = 0;
        log.debug('browse', 'facets changed', { dimension, selected: [...selected] });
        renderCurrent();
      },
      onQueryChange: (q) => {
        query = q;
        browseOffset = 0; // a new query set → back to page 1
        log.debug('browse', 'query changed', { length: q.trim().length });
        renderCurrent();
      },
      onReset: () => {
        state = { ...state, photosOnly: false, facets: { cuisine: [], category: [] } };
        browsePrefs.save(state);
        query = '';
        toolbar.setSearch('');
        toolbar.setPhotos(false);
        browseOffset = 0;
        log.info('browse', 'filters reset');
        showCurrent(); // rebuild the (now-empty) facet dropdowns + re-render
      },
    },
  });

  // Initialize the controls from prefs.
  toolbar.setPhotos(state.photosOnly);
  toolbar.reflectView(state.view);

  // Export: turn the currently-shown recipes into a downloadable file. The
  // button sits beside "Find recipes"; it opens an inline panel (no native
  // dialog) to pick a format and whether to include full details, then builds a
  // download link. The version-collapsed representatives are what's exported —
  // the same cards the user sees.
  const recipeLink = (uri: string): string => {
    const url = new URL('recipe.html', window.location.href);
    url.searchParams.set('u', uri);
    return url.toString();
  };
  const toExportRecipe = (entry: CachedRecipe): ExportRecipe => {
    const value = entry.value as {
      name?: string;
      ingredients?: string[];
      instructions?: string[];
    };
    const facets = recipeFacets(entry.value);
    return {
      name: value.name ?? '(untitled)',
      cuisine: facets.cuisine ?? '',
      category: facets.category ?? '',
      link: recipeLink(entry.uri),
      ingredients: value.ingredients ?? [],
      instructions: value.instructions ?? [],
    };
  };

  const exportButton = el('button', 'button export-recipes', '↑') as HTMLButtonElement;
  exportButton.type = 'button';
  exportButton.dataset['testid'] = 'export-recipes';
  exportButton.setAttribute('aria-label', 'Export shown recipes');
  exportButton.title = 'Export shown recipes';

  const exportPanel = el('div', 'export-panel');
  exportPanel.dataset['testid'] = 'export-panel';
  exportPanel.hidden = true;
  let downloadUrl: string | null = null;
  const revokeDownload = (): void => {
    if (downloadUrl !== null) {
      URL.revokeObjectURL(downloadUrl);
      downloadUrl = null;
    }
  };

  const buildExportPanel = (): void => {
    revokeDownload();
    exportPanel.replaceChildren();
    const shownCount = collapseVersions(computeShown().shown).representatives.length;
    exportPanel.append(el('p', 'export-title', `Export ${shownCount} shown recipe${shownCount === 1 ? '' : 's'}`));

    // Format choice (segmented).
    let format: ExportFormat = 'csv';
    const formatRow = el('div', 'segmented export-format');
    const formatBtns: [HTMLButtonElement, ExportFormat][] = [];
    const reflectFormat = (): void => {
      for (const [btn, key] of formatBtns) {
        const active = format === key;
        btn.classList.toggle('segmented-option--active', active);
        btn.setAttribute('aria-pressed', String(active));
      }
    };
    for (const key of ['csv', 'txt', 'json'] as const) {
      const btn = el('button', 'segmented-option', key.toUpperCase()) as HTMLButtonElement;
      btn.type = 'button';
      btn.dataset['testid'] = `export-format-${key}`;
      btn.addEventListener('click', () => {
        format = key;
        reflectFormat();
        buildLink();
      });
      formatBtns.push([btn, key]);
      formatRow.append(btn);
    }
    reflectFormat();

    // Full-details toggle.
    const detailsLabel = el('label', 'browse-toggle');
    const detailsToggle = document.createElement('input');
    detailsToggle.type = 'checkbox';
    detailsToggle.dataset['testid'] = 'export-details';
    detailsLabel.append(detailsToggle, document.createTextNode('Include full details (ingredients & instructions)'));
    detailsToggle.addEventListener('change', () => buildLink());

    // The generated download link (rebuilt whenever a choice changes).
    const linkSlot = el('div', 'export-link-slot');
    const buildLink = (): void => {
      revokeDownload();
      const recipes = collapseVersions(computeShown().shown).representatives.map(toExportRecipe);
      const text = serializeRecipes(recipes, { format, details: detailsToggle.checked });
      const blob = new Blob([text], { type: mimeFor(format) });
      downloadUrl = URL.createObjectURL(blob);
      const link = el('a', 'button button--primary export-download', `Download recipes.${extensionFor(format)}`) as HTMLAnchorElement;
      link.href = downloadUrl;
      link.download = `arecipe-recipes.${extensionFor(format)}`;
      link.dataset['testid'] = 'export-download';
      linkSlot.replaceChildren(link);
    };

    const close = el('button', 'button export-close', 'Close') as HTMLButtonElement;
    close.type = 'button';
    close.dataset['testid'] = 'export-close';
    close.addEventListener('click', () => {
      exportPanel.hidden = true;
      revokeDownload();
    });

    exportPanel.append(formatRow, detailsLabel, linkSlot, close);
    buildLink();
  };

  exportButton.addEventListener('click', () => {
    if (!exportPanel.hidden) {
      exportPanel.hidden = true;
      revokeDownload();
      return;
    }
    if (current === null || computeShown().shown.length === 0) {
      // Nothing to export yet — surface it in the status line rather than opening
      // an empty panel.
      toolbar.setStatus('nothing to export — find or load some recipes first');
      return;
    }
    buildExportPanel();
    exportPanel.hidden = false;
  });

  form.append(input, findButton, exportButton);
  content.append(form, exportPanel, toolbar.element, listContainer, pager);

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
    browseOffset = 0; // a new feed starts at page 1
    showCurrent();
  };

  // The find path, shared by the form submit and a typeahead pick. Resolving by
  // handle (not the suggestion's DID) keeps a single code path: both entries
  // hand a handle string to the same resolve → read → show pipeline.
  const runFind = (handle: string): void => {
    const gen = ++generation;
    toolbar.setStatus('finding…');
    void (async () => {
      const identity: ResolvedIdentity = await resolve(handle);
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
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runFind(input.value.trim());
  });

  // Cook-search typeahead: suggest accounts as the user types (Bluesky AppView),
  // so finding a cook doesn't require knowing their exact handle. Picking a
  // suggestion fills the handle and runs the same find path as submit.
  attachActorTypeahead({
    input,
    onSelect: (suggestion) => {
      input.value = suggestion.handle;
      runFind(suggestion.handle);
    },
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
    browseOffset = 0; // fresh feed → page 1
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
