// Browse page: handle in, verified recipe cards out. This document ships
// ZERO auth code (enforced by the bundle-split e2e test) — the public read
// path needs no session (D2). The view/filter control bar is the shared
// renderToolbar (Phase 7); Browse owns the search form, starter feed, diet
// preference, and version collapse.

import { mountBuildStamp } from '../build-stamp.js';
import { renderAddCookPanel } from '../social/add-cook-panel.js';
import { createResolver, type ResolvedIdentity } from '../identity/resolve.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { createExclusions } from '../recipes/exclusions.js';
import { collapseVersions } from '../recipes/model.js';
import { createStarterPrefs, loadStarterFeed } from '../recipes/starter.js';
import { loadSnapshotFeed, loadSnapshotManifest } from '../snapshot/load.js';
import { createSnapshotStore } from '../snapshot/store.js';
import { snapshotBuildId } from '../snapshot/paths.js';
import { revalidateCooks } from '../snapshot/revalidate.js';
import { resolveDidDoc } from '../identity/did.js';
import { createCookFollowsLocal } from '../social/cook-follows-local.js';
import { mergeCookAuthors } from '../social/default-feed.js';
import { createRecipeReader } from '../recipes/read.js';
import { createDietPreference } from '../recipes/diet-preference.js';
import { createSearchMemo, queryEntries } from '../recipes/search.js';
import {
  isPlannedSort,
  partitionByPlanned,
  PLANNED_SORT_MODES,
  sortEntries,
} from '../recipes/sort.js';
import { createPlannedIndexCache } from '../recipes/planned-index-local.js';
import type { PlannedEntry } from '../recipes/planned-index.js';
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
import {
  renderInSeasonStrip,
  renderRecipeDetailsList,
  renderRecipeList,
  type RenderOptions,
} from '../recipes/view.js';
import { createSeasonalityPrefs } from '../seasonality/prefs.js';
import { currentMonth, inSeasonProduce, inSeasonUriSet } from '../seasonality/season.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  const listContainer = el('div');

  // Preview follow bar (D1/D2): when a lookup previews a cook's recipes, this bar
  // names the cook and offers Follow / Following + a "back to the feed" return.
  // Following adds them to the local cook-follows store so the default feed merges
  // them in on the next return. Hidden on the default feed (kind !== 'search').
  const previewBar = el('div', 'preview-bar');
  previewBar.dataset['testid'] = 'preview-bar';
  previewBar.hidden = true;
  const backToFeed = el('button', 'button back-to-feed', '← Feed') as HTMLButtonElement;
  backToFeed.type = 'button';
  backToFeed.dataset['testid'] = 'back-to-feed';
  backToFeed.setAttribute('aria-label', 'Back to the default feed');
  const previewHandle = el('span', 'preview-handle');
  previewHandle.dataset['testid'] = 'preview-handle';
  const followBtn = el('button', 'button follow-cook', 'Follow') as HTMLButtonElement;
  followBtn.type = 'button';
  followBtn.dataset['testid'] = 'follow-cook';
  previewBar.append(backToFeed, previewHandle, followBtn);
  // The cook currently previewed (drives the follow control). DID is required to
  // follow; a lookup with no resolvable DID hides the control.
  let previewAuthor: { handle: string; did: string } | null = null;
  const reflectFollow = (): void => {
    if (previewAuthor === null || previewAuthor.did === '') {
      followBtn.hidden = true;
      return;
    }
    followBtn.hidden = false;
    const following = cookFollows.has(previewAuthor.did);
    followBtn.textContent = following ? 'Following' : 'Follow';
    followBtn.setAttribute('aria-pressed', String(following));
    followBtn.classList.toggle('follow-cook--following', following);
  };
  followBtn.addEventListener('click', () => {
    if (previewAuthor === null || previewAuthor.did === '') return;
    if (cookFollows.has(previewAuthor.did)) cookFollows.remove(previewAuthor.did);
    else cookFollows.add(previewAuthor);
    log.info('browse', 'cook follow toggled', { following: cookFollows.has(previewAuthor.did) });
    reflectFollow();
  });

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
  const seasonalityPrefs = createSeasonalityPrefs();
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
    authorDid?: string; // search: the previewed cook's DID (for the follow control)
    authorsByDid?: Record<string, string>;
    statusSuffix?: string; // starter: " — X unavailable" / " · showing saved copies"
  };
  let current: Current | null = null;

  // Cook follows (D2/D4/D5): the device-local store is the ONLY follow surface
  // Browse touches — reading it composes the merged default feed, and the preview
  // follow control writes it. Browse ships zero auth code, so it never publishes a
  // cookFollow record; the signed-in pages mirror this store to/from the PDS.
  const cookFollows = createCookFollowsLocal();

  // RUN-LAST-PLANNED (D4): read the viewer's planned-index cache — reader only,
  // no plan-record fetch, no auth (Browse ships zero auth code, and this keeps
  // it that way). Present → the planned-history sorts are offered and the
  // never-planned tail group renders; absent → Browse is unchanged.
  const plannedIndex: Map<string, PlannedEntry> | null =
    (await createPlannedIndexCache()
      .read()
      .catch(() => null)) ?? null;

  // A neutral state for the eligibility pass: no on-tab filters, so only the
  // standing preferences (diet via matchesFilter, taste via matchesTaste) apply.
  const NO_TAB_FILTERS: BrowseState = { view: 'tiles', photosOnly: false, sort: 'default', facets: { cuisine: [], category: [] } };

  // The daily-mix seed: today's calendar day (UTC). Read per render so the
  // default order rolls over at midnight without a reload. Field sorts ignore it.
  const todaySeed = (): string => new Date().toISOString().slice(0, 10);

  // The user's eligible pool: hidden recipes removed, then the Settings-owned
  // standing preferences (diet + taste) applied. Everything downstream — the
  // baseline count, the facet dropdowns' available options, and the shown set —
  // works from this pool, so a standing preference never surfaces as "eligible
  // recipes not shown" or as a facet option that can only yield zero.
  const eligibleEntries = (): CachedRecipe[] => {
    const diet = dietPreference.load();
    const dietMode = dietPreference.loadMode();
    const taste = tastePreference.load();
    return withoutHidden(current?.entries ?? []).filter(
      (e) =>
        matchesFilter(e.value, { state: NO_TAB_FILTERS, diet, dietMode }) &&
        matchesTaste(recipeFacets(e.value), taste),
    );
  };

  // Selected facets that no longer exist in the eligible pool are kept in state
  // (so they re-apply when the user returns) but treated as inert here.
  const effectiveState = (): BrowseState => {
    const available = availableFacets(eligibleEntries());
    return {
      view: state.view,
      photosOnly: state.photosOnly,
      sort: state.sort,
      facets: {
        cuisine: state.facets.cuisine.filter((c) => available.cuisine.includes(c)),
        category: state.facets.category.filter((c) => available.category.includes(c)),
      },
    };
  };

  // On-tab filters only (photos + facets + text query): these drive both the
  // reset control and the "X of N" status. The Settings-owned standing
  // preferences (diet + taste) are deliberately excluded — they define the
  // eligible pool (the N itself, see computeShown), not a filter over it.
  const hasBrowseFilters = (s: BrowseState): boolean =>
    s.photosOnly || s.facets.cuisine.length > 0 || s.facets.category.length > 0 || query.trim() !== '';

  // The result sets behind the current view. Two layers, counted differently:
  //   eligible — the standing-preference pool (see eligibleEntries): the
  //     baseline "N" in the status.
  //   shown — eligible narrowed by the on-tab filters (photos, facets, text
  //     query): the "X" in "X of N", and what the export serializes.
  const computeShown = (): { eligible: CachedRecipe[]; shown: CachedRecipe[]; effective: BrowseState } => {
    const eligible = eligibleEntries();
    const effective = effectiveState();
    const facetFiltered = eligible.filter((e) => matchesFilter(e.value, { state: effective, diet: [] }));
    // Text search runs AFTER the facet filter and BEFORE version collapse (D5):
    // with an active query only matches survive, in score order; an empty query
    // is the identity (facet order preserved). The index is over the whole feed
    // (stable identity) — queryEntries intersects with the candidates.
    const searcher = searchMemo(current?.entries ?? []);
    const matched = queryEntries(searcher, query, facetFiltered);
    // Order the shown set. An explicit field sort (name/date/cuisine/meal)
    // always applies; the daily-mix default yields to text-search relevance
    // when a query is active (a shuffle of search hits is worse than by-score),
    // and is the day-seeded shuffle otherwise.
    // A planned-history sort (D6) is grouped at render time, so leave `matched`
    // unordered here; renderCurrent partitions it.
    const shown =
      (isPlannedSort(state.sort) && plannedIndex !== null) ||
      (state.sort === 'default' && query.trim() !== '')
        ? matched
        : sortEntries(matched, state.sort, { daySeed: todaySeed() });
    return { eligible, shown, effective };
  };

  const renderCurrent = (): void => {
    if (current === null) return;
    const { eligible, shown, effective } = computeShown();
    // A plain count of the eligible pool: "N recipes"; with an on-tab filter
    // active, the honest "X of N recipes" ("X/N" at phone widths, where the
    // long form pushes the reset + count off the controls row).
    toolbar.setStatus(
      hasBrowseFilters(effective)
        ? `${shown.length} of ${eligible.length} recipes`
        : `${eligible.length} ${eligible.length === 1 ? 'recipe' : 'recipes'}${current.statusSuffix ?? ''}`,
      hasBrowseFilters(effective) ? `${shown.length}/${eligible.length}` : undefined,
    );
    toolbar.setResetVisible(hasBrowseFilters(effective));
    // Filters ▾ badge = active browse filters (photos + facets); the text query
    // is a row-1 control, counted separately by its own presence.
    toolbar.setFilterCount(
      (effective.photosOnly ? 1 : 0) + effective.facets.cuisine.length + effective.facets.category.length,
    );
    // Planned-history sort (D6): render the planned recipes in order, then the
    // never-planned (or future-only) recipes in a labelled tail group below a
    // divider — never interleaved. This view skips version-collapse/paging (the
    // grouping is the point); the pager is hidden.
    if (isPlannedSort(state.sort) && plannedIndex !== null) {
      const { planned, neverPlanned } = partitionByPlanned(shown, state.sort, plannedIndex);
      const groupOptions: RenderOptions = {};
      if (current.author !== undefined) groupOptions.author = current.author;
      if (current.authorsByDid !== undefined) groupOptions.authorsByDid = current.authorsByDid;
      pager.hidden = true;
      pagerHint.textContent = '';
      const renderList = state.view === 'details' ? renderRecipeDetailsList : renderRecipeList;
      const nodes: Node[] = [];
      if (planned.length > 0) nodes.push(renderList(planned, groupOptions));
      if (neverPlanned.length > 0) {
        const group = el('section', 'never-planned-group');
        group.dataset['testid'] = 'never-planned-group';
        group.append(
          el('hr', 'never-planned-divider'),
          el('p', 'never-planned-label', 'Never planned'),
          renderList(neverPlanned, groupOptions),
        );
        nodes.push(group);
      }
      listContainer.replaceChildren(...nodes);
      return;
    }
    const options: RenderOptions = {};
    if (current.author !== undefined) options.author = current.author;
    if (current.authorsByDid !== undefined) options.authorsByDid = current.authorsByDid;
    // Collapse alternative versions to one card per dish (with a "N versions"
    // badge linking to the compare grid); single recipes are untouched.
    const { representatives, counts } = collapseVersions(shown);
    options.versionCounts = counts;
    // Seasonality (Feature B): boost only. The main feed order is untouched —
    // the boost surfaces as an "In season now" strip above it plus a quiet badge
    // on matching cards. With the setting off, this whole block is skipped and
    // Browse is byte-identical to the pre-feature baseline.
    let seasonStrip: HTMLElement | null = null;
    if (seasonalityPrefs.enabled()) {
      const ctx = { month: currentMonth(), region: seasonalityPrefs.region() };
      options.inSeasonUris = inSeasonUriSet(representatives, ctx);
      seasonStrip = renderInSeasonStrip(inSeasonProduce(representatives, ctx));
    }
    // Window the collapsed cards to one page; the arrows step through the rest.
    const page = windowPage(representatives, { offset: browseOffset, size: BROWSE_PAGE_SIZE });
    browseOffset = page.total === 0 ? 0 : page.start - 1; // sync to the clamped window
    const paged = page.total > BROWSE_PAGE_SIZE;
    pager.hidden = !paged;
    pagerHint.textContent = paged ? `Showing ${page.start}–${page.end} of ${page.total}` : '';
    pagerPrev.disabled = !page.hasPrev;
    pagerNext.disabled = !page.hasNext;
    const render = state.view === 'details' ? renderRecipeDetailsList : renderRecipeList;
    const rendered = render(page.items, options);
    if (seasonStrip !== null) listContainer.replaceChildren(seasonStrip, rendered);
    else listContainer.replaceChildren(rendered);
    log.debug('browse', 'render', {
      kind: current.kind,
      view: state.view,
      shown: shown.length,
      total: eligible.length,
      filtered: hasBrowseFilters(effective),
    });
  };

  // Rebuild the facet dropdowns from the eligible pool's available facets.
  // Called when `current` changes (feed vs search) — NOT on a facet checkbox
  // change. (Reloading the page picks up Settings changes to diet/taste.)
  const rebuildToolbarFacets = (): void => {
    toolbar.rebuildFacets(availableFacets(eligibleEntries()), state.facets);
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
    // Planned-history sorts offered only when a planned-index cache exists (D6).
    ...(plannedIndex !== null ? { extraSortModes: PLANNED_SORT_MODES } : {}),
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
      onSortChange: (sort) => {
        state = { ...state, sort };
        browsePrefs.save(state);
        browseOffset = 0; // reordered → back to page 1
        log.debug('browse', 'sort changed', { sort });
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
        showCurrent(); // rebuild the (now-empty) facet groups + re-render
      },
    },
  });

  // Initialize the controls from prefs.
  toolbar.setPhotos(state.photosOnly);
  toolbar.reflectView(state.view);
  toolbar.setSort(state.sort);

  // Export: turn the currently-shown recipes into a downloadable file. The
  // button sits beside "Find recipes"; it opens an inline panel (no native
  // dialog) to pick a format and whether to include full details, then builds a
  // download link. Every recipe that survived the filters is exported —
  // including alternative versions the card view collapses behind a "N
  // versions" badge — so the panel's count always matches the toolbar's
  // recipe count and no data is silently dropped from the file.
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
    const shownCount = computeShown().shown.length;
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
      const recipes = computeShown().shown.map(toExportRecipe);
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

  // "+ Cook" (D7): a compact toolbar-row-1 action that opens an inline panel
  // housing the cook typeahead. Submitting a handle runs the lookup → PREVIEW.
  const addCookButton = el('button', 'button add-cook', '+ Cook') as HTMLButtonElement;
  addCookButton.type = 'button';
  addCookButton.dataset['testid'] = 'add-cook';
  addCookButton.setAttribute('aria-label', 'Look up a cook');
  const addCookPanel = renderAddCookPanel({
    buttonLabel: 'Look up',
    placeholder: 'a cook’s handle — try rdur.dev',
    onSubmit: (handle) => {
      addCookPanel.element.hidden = true;
      runFind(handle);
    },
  });
  addCookPanel.element.hidden = true;
  addCookButton.addEventListener('click', () => {
    const opening = addCookPanel.element.hidden;
    addCookPanel.element.hidden = !opening;
    if (opening) addCookPanel.input.focus();
  });

  // Row-1 actions: "+ Cook" then export. (Export sits in the toolbar per D7.)
  toolbar.actionsSlot.append(addCookButton, exportButton);
  content.append(toolbar.element, addCookPanel.element, exportPanel, previewBar, listContainer, pager);

  const resolve = createResolver();
  const readRecipes = createRecipeReader();
  const cache = createRecipeCache();

  // Last search survives navigation (5d): opening a recipe page and coming back
  // re-renders the results from the cache — no network, no empty page. The DID is
  // carried too (added with cook follows) so the preview's follow control works on
  // a back-restore; older stored entries without it just hide the control.
  type LastFind = { handle: string; did?: string; uris: string[] };
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
  const clearLastFind = (): void => {
    try {
      window.sessionStorage.removeItem('last-find');
    } catch {
      /* private mode: nothing persisted anyway */
    }
  };

  const showEntries = (entries: CachedRecipe[], author: string, authorDid?: string): void => {
    current = { entries, kind: 'search', author, authorDid };
    // Enter preview mode: name the cook + reflect follow state.
    previewAuthor = { handle: author, did: authorDid ?? '' };
    previewBar.hidden = false;
    previewHandle.textContent = `@${author}`;
    reflectFollow();
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
      saveLastFind({ handle: identity.handle, did: identity.did, uris: entries.map((e) => e.uri) });
      if (gen !== generation) return; // superseded
      showEntries(entries, identity.handle, identity.did);
    })().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error('recipes', 'find failed', { error: message });
      if (gen === generation) toolbar.setStatus(message);
    });
  };

  // The default feed (D2): starter-pack cooks merged with the cooks you've
  // followed (local store), deduped by DID. Leaving preview mode returns here.
  const showStarterFeed = async (): Promise<void> => {
    const gen = generation; // page-load generation; a search supersedes us
    // Returning to the default feed leaves the preview.
    previewAuthor = null;
    previewBar.hidden = true;
    const enabled = createStarterPrefs().enabledAuthors();
    const followed = cookFollows.list().map((f) => ({ handle: f.handle, did: f.did }));
    const authors = mergeCookAuthors(enabled, followed);
    if (authors.length === 0) {
      toolbar.setStatus('starter pack is off — search a cook above');
      return;
    }
    // Entries accumulate per cook so revalidation can replace/remove one cook's
    // records in place (live wins, D4) without disturbing the others.
    const authorDids = new Set(authors.map((a) => a.did));
    const entriesByDid = new Map<string, CachedRecipe[]>();
    const authorsByDid: Record<string, string> = {};
    const didOf = (e: CachedRecipe): string => e.uri.split('/')[2] ?? '';
    const applyEntries = (statusSuffix = ''): void => {
      current = { entries: [...entriesByDid.values()].flat(), kind: 'starter', authorsByDid, statusSuffix };
      browseOffset = 0;
      showCurrent();
    };

    // D2: paint from the precached build-time snapshot FIRST — index + shards
    // are same-origin, immutable, and precached, so first paint costs zero PDS
    // network. Seeding the cache here also lets the live path degrade to these
    // copies if the network is down, so the feed never blanks.
    const snap = await loadSnapshotFeed({ cache }).catch((err: unknown) => {
      log.warn('snapshot', 'snapshot feed failed — live only', { error: String(err) });
      return null;
    });
    if (gen !== generation) return;
    const store = createSnapshotStore({ buildId: snapshotBuildId() });
    if (snap !== null) {
      Object.assign(authorsByDid, snap.authorsByDid);
      for (const e of snap.entries) {
        const did = didOf(e);
        if (!authorDids.has(did)) continue;
        (entriesByDid.get(did) ?? entriesByDid.set(did, []).get(did)!).push(e);
      }
      if (entriesByDid.size > 0) applyEntries();
    }

    // Cross-session freshness: the bundle is a build-time snapshot and can be
    // days stale (a cook that published since the last deploy). A prior session
    // may already have refetched that cook live and stored the delta — overlay
    // it now so a returning visitor sees the last-known-live corpus (and count)
    // immediately, instead of being stuck on the stale bundle for up to the
    // 60-minute rev-check debounce. Live revalidation below still wins when it
    // lands. These are bounded local IndexedDB reads, so the bundle still paints
    // first and this never blocks first paint on the network.
    let overlaidDelta = false;
    for (const a of authors) {
      const delta = await store.getLatestDelta(a.did).catch(() => null);
      if (gen !== generation) return;
      if (delta === null) continue;
      const records = delta.records as { uri: string; cid: string; value: Record<string, unknown> }[];
      entriesByDid.set(a.did, await Promise.all(records.map((r) => cache.put(r))));
      overlaidDelta = true;
    }
    if (overlaidDelta) applyEntries();

    // Revalidation, off the critical path.
    const manifest = snap === null ? null : await loadSnapshotManifest().catch(() => null);
    if (snap !== null && manifest !== null) {
      const covered = manifest.cooks.filter((c) => authorDids.has(c.did));
      const coveredDids = new Set(covered.map((c) => c.did));

      // Rev-revalidate snapshot cooks: ONE getLatestCommit each; unchanged cooks
      // fetch no records. Changed/gone/renamed all update in place (D3/D4).
      void revalidateCooks(
        covered.map((c) => ({ did: c.did, handle: c.handle, displayName: c.displayName, pds: c.pds, rev: c.rev })),
        {
          store,
          debounceMs: 60 * 60 * 1000, // O2: 60 minutes
          readRecords: (t) => readRecipes(t),
          resolveIdentity: async (did) => {
            const doc = await resolveDidDoc(did);
            return { handle: doc.handle ?? '' };
          },
          onChanged: async (did, records) => {
            if (gen !== generation) return;
            entriesByDid.set(did, await Promise.all(records.map((r) => cache.put(r))));
            applyEntries();
          },
          onGone: (did) => {
            if (gen !== generation) return;
            entriesByDid.delete(did); // a dead cook is not rendered because the bundle says they exist (D4)
            applyEntries();
          },
          onIdentity: (did, id) => {
            if (gen !== generation || id.handle === '') return;
            authorsByDid[did] = id.handle; // provisional snapshot identity yields to live (D4)
            applyEntries();
          },
        },
      ).catch((err: unknown) => log.warn('snapshot', 'revalidation failed', { error: String(err) }));

      // Followed cooks not covered by the snapshot still load live.
      const uncovered = authors.filter((a) => !coveredDids.has(a.did));
      if (uncovered.length > 0) {
        const feed = await loadStarterFeed(uncovered);
        if (gen !== generation) return;
        Object.assign(authorsByDid, feed.authorsByDid);
        const byDid = new Map<string, CachedRecipe[]>();
        for (const e of feed.entries) (byDid.get(didOf(e)) ?? byDid.set(didOf(e), []).get(didOf(e))!).push(e);
        for (const [did, list] of byDid) entriesByDid.set(did, list);
        applyEntries();
      }
      return;
    }

    // No snapshot (or no manifest): the existing full live path.
    if (snap === null) toolbar.setStatus('loading your starter pack…');
    const feed = await loadStarterFeed(authors);
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

  // Leave a preview and return to the default feed (the preview bar's "← Feed"):
  // clears the remembered lookup + closes the add-cook panel, then reloads the
  // merged default feed (any cook followed in the preview now appears in it).
  const returnToFeed = (): void => {
    clearLastFind();
    addCookPanel.clear();
    addCookPanel.element.hidden = true;
    void showStarterFeed().catch((err: unknown) => {
      log.warn('starter', 'default feed failed', { error: String(err) });
      toolbar.setStatus('starter pack unavailable — search a cook above');
    });
  };
  backToFeed.addEventListener('click', returnToFeed);

  const last = readLastFind();
  if (last !== null) {
    void (async () => {
      const entries = (await Promise.all(last.uris.map((u) => cache.get(u)))).filter(
        (e): e is NonNullable<typeof e> => e !== undefined,
      );
      if (entries.length > 0) showEntries(entries, last.handle, last.did);
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

void main();
