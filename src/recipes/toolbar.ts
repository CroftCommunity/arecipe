// Shared view/filter toolbar, unified to the D7 contract so Browse and Cookbook
// render the identical control structure:
//   Row 1  — the full-width recipe-search input + a page-actions slot (Browse
//            mounts "+ Cook" and export there; Cookbook mounts nothing).
//   Row 2  — a source slot (Cookbook mounts its Mine | Liked | All segmented;
//            empty and collapsed elsewhere). With `filtersInSourceRow` the
//            "Filters ▾" disclosure rides this row too, right of the source
//            control — one filter line (Cookbook own view).
//   Row 3  — the Tiles | Details view toggle + the "Filters ▾" disclosure with a
//            count badge (unless it moved to row 2), and the honest "N of M
//            shown" count OUTSIDE it, with the reset control in that same count
//            block (reset-surface v2).
// The Filters popover holds photos-only, the Meal / Cuisine facet groups, and
// the diet-preference link (Browse only). Reset does NOT live in the popover:
// it sits in the count block (before the count) and appears only when a filter
// is active, so clearing is one visible tap — not two behind a closed
// disclosure. No control appears twice.
// The toolbar owns only its own DOM + control listeners (wired to callbacks); the
// page owns the feed/list and drives it through the returned controller.

import type { BrowseState, ViewMode } from '../pages/browse-state.js';
import { resetIconButton } from '../icons.js';
import { renderFacetGroup } from './view.js';

/** Facet selection/availability: arrays of values per dimension (distinct from
 *  the per-recipe `RecipeFacets`, whose category/cuisine are single values). */
type FacetArrays = BrowseState['facets'];

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export type ToolbarCallbacks = {
  onViewChange: (view: ViewMode) => void;
  onPhotosToggle: (photosOnly: boolean) => void;
  onFacetChange: (dimension: 'cuisine' | 'category', value: string, checked: boolean) => void;
  onReset: () => void;
  /** Text-search query changed (debounced). The raw input value is passed; the
   *  page trims it (empty/whitespace = identity, per D4). */
  onQueryChange: (query: string) => void;
};

// As-you-type debounce (D7): coalesce keystrokes so the pipeline re-runs once the
// user pauses, not on every character.
const SEARCH_DEBOUNCE_MS = 150;

// Phone cutoff for the compact status variant — the stylesheet's 40rem mobile
// breakpoint, so text and layout switch together.
const COMPACT_STATUS_QUERY = '(max-width: 40rem)';

export type ToolbarController = {
  /** The `.browse-toolbar` element to mount. */
  element: HTMLElement;
  /** Row-1 slot after the search input — Browse mounts "+ Cook" + export here. */
  actionsSlot: HTMLElement;
  /** Row-2 slot — Cookbook mounts its Mine | Liked | All segmented here. */
  sourceSlot: HTMLElement;
  /** Reflect the active view on the segmented control (aria-pressed + class). */
  reflectView: (view: ViewMode) => void;
  /** Reflect the photos-only checkbox state (init / reset). */
  setPhotos: (photosOnly: boolean) => void;
  /** Rebuild the Meal / Cuisine facet groups from the feed's available facets.
   *  Called when the feed changes — NOT on a facet checkbox change (so an open
   *  Filters popover survives multi-select). */
  rebuildFacets: (available: FacetArrays, selected: FacetArrays) => void;
  /** Set the honest count/status line text (shown OUTSIDE the disclosure).
   *  `compact` is an optional short form ("3/12") shown instead at phone widths,
   *  where the long "X of N recipes" wraps the controls row. */
  setStatus: (text: string, compact?: string) => void;
  /** Show/hide the reset control (only when a filter is active). */
  setResetVisible: (visible: boolean) => void;
  /** Set the active-filter count on the Filters ▾ badge (hidden at zero). */
  setFilterCount: (count: number) => void;
  /** Reflect a query value into the search box (init / reset). Display-only — it
   *  does NOT fire onQueryChange (the caller already owns the state change). */
  setSearch: (query: string) => void;
};

export const renderToolbar = (opts: {
  /** Browse shows the "preference ↗" diet link inside Filters; Cookbook does not. */
  showDietLink?: boolean;
  /** Mount Filters ▾ on the source row, right of the page's source control, so
   *  ALL filtering reads as one line (Cookbook own view — owner mobile feedback
   *  2026-07-16). The controls row then holds view toggle + reset + count only.
   *  Default (false — Browse, cookbook cold-view): Filters stays on the
   *  controls row and the empty source row collapses. */
  filtersInSourceRow?: boolean;
  callbacks: ToolbarCallbacks;
}): ToolbarController => {
  const { callbacks } = opts;
  const showDietLink = opts.showDietLink ?? false;
  const filtersInSourceRow = opts.filtersInSourceRow ?? false;

  const toolbar = el('div', 'browse-toolbar');

  // --- Row 1: search + page actions ---
  const rowSearch = el('div', 'toolbar-row toolbar-row--search');
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'recipe-search';
  searchInput.placeholder = 'search recipes…';
  searchInput.dataset['testid'] = 'recipe-search';
  searchInput.setAttribute('aria-label', 'Search recipes');
  const actionsSlot = el('div', 'toolbar-actions');
  actionsSlot.dataset['testid'] = 'toolbar-actions';
  rowSearch.append(searchInput, actionsSlot);

  // --- Row 2: source slot (Cookbook) — collapses when empty (CSS). With
  // filtersInSourceRow the row is a composite [inner slot | Filters ▾]: the
  // page's source control mounts into the INNER slot so it stays left of
  // Filters in DOM (and tab) order, and the row never renders empty because
  // the option implies a source control is coming. ---
  const rowSource = el('div', 'toolbar-row toolbar-row--source');
  rowSource.dataset['testid'] = 'toolbar-source';
  const sourceSlot = filtersInSourceRow ? el('div', 'toolbar-source-slot') : rowSource;
  if (filtersInSourceRow) rowSource.append(sourceSlot);

  // --- Row 3: view toggle + Filters ▾ + honest count ---
  const rowControls = el('div', 'toolbar-row toolbar-row--controls');

  const viewSegmented = el('div', 'segmented');
  const viewTiles = el('button', 'segmented-option', 'Tiles') as HTMLButtonElement;
  viewTiles.type = 'button';
  viewTiles.dataset['testid'] = 'view-tiles';
  const viewDetails = el('button', 'segmented-option', 'Details') as HTMLButtonElement;
  viewDetails.type = 'button';
  viewDetails.dataset['testid'] = 'view-details';
  viewSegmented.append(viewTiles, viewDetails);

  // The single Filters disclosure (the facet-dd popover idiom). One popover, so
  // no exclusive-accordion `name` is needed to avoid stacking.
  const filtersDd = el('details', 'facet-dd filters-dd') as HTMLDetailsElement;
  filtersDd.dataset['testid'] = 'filters-dd';
  const filtersSummary = el('summary', 'facet-dd-summary');
  const filtersBadge = el('span', 'facet-count');
  filtersBadge.dataset['testid'] = 'filters-count';
  filtersBadge.hidden = true;
  filtersSummary.append(document.createTextNode('Filters '), filtersBadge, document.createTextNode(' ▾'));
  const filtersPanel = el('div', 'facet-dd-panel filters-panel');

  // Photos-only toggle (inside the popover).
  const photosToggleLabel = el('label', 'browse-toggle');
  const photosToggle = document.createElement('input');
  photosToggle.type = 'checkbox';
  photosToggle.dataset['testid'] = 'photos-only';
  photosToggleLabel.append(photosToggle, document.createTextNode('Photos only'));

  // Meal / Cuisine facet groups container (rebuilt from the feed's facets).
  const facetsContainer = el('div', 'browse-facets');

  filtersPanel.append(photosToggleLabel, facetsContainer);

  // Diet link (Browse only) inside the popover.
  if (showDietLink) {
    const dietLink = el('a', 'diet-pref-link', 'preference ↗') as HTMLAnchorElement;
    dietLink.href = './account.html#diet-preference';
    filtersPanel.append(dietLink);
  }

  filtersDd.append(filtersSummary, filtersPanel);

  // Honest count OUTSIDE the disclosure, right-aligned — with the reset control
  // (reset-surface v2, D4). Reset is the shared icon button (src/icons.ts), sits
  // BEFORE the count so it reads "reset · N of M shown", and shows only when a
  // filter is active (setResetVisible) — the contextual appearance is the
  // discoverability mitigation for going icon-only.
  const countBlock = el('div', 'browse-count');
  const resetBtn = resetIconButton('reset filters');
  resetBtn.dataset['testid'] = 'reset-filters';
  resetBtn.hidden = true;
  const recipesStatus = el('p', 'status');
  recipesStatus.dataset['testid'] = 'recipes-status';
  countBlock.append(resetBtn, recipesStatus);

  // Compact-status plumbing: keep both variants and re-pick when the viewport
  // crosses the phone breakpoint (rotation, window resize), so the shown text
  // always matches the width — not the width at last render.
  let statusText = '';
  let statusCompact: string | undefined;
  const compactMq = window.matchMedia(COMPACT_STATUS_QUERY);
  const applyStatus = (): void => {
    recipesStatus.textContent = compactMq.matches && statusCompact !== undefined ? statusCompact : statusText;
  };
  compactMq.addEventListener('change', applyStatus);

  if (filtersInSourceRow) {
    rowSource.append(filtersDd);
    rowControls.append(viewSegmented, countBlock);
  } else {
    rowControls.append(viewSegmented, filtersDd, countBlock);
  }

  toolbar.append(rowSearch, rowSource, rowControls);

  // --- control listeners → callbacks ---
  viewTiles.addEventListener('click', () => callbacks.onViewChange('tiles'));
  viewDetails.addEventListener('click', () => callbacks.onViewChange('details'));
  photosToggle.addEventListener('change', () => callbacks.onPhotosToggle(photosToggle.checked));
  resetBtn.addEventListener('click', () => callbacks.onReset());

  // Debounced search: coalesce keystrokes, then report the latest value once.
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener('input', () => {
    if (searchTimer !== undefined) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => callbacks.onQueryChange(searchInput.value), SEARCH_DEBOUNCE_MS);
  });

  // Facet checkbox change (event-delegated): report the change; the page updates
  // state + re-renders, leaving the Filters popover open and intact.
  facetsContainer.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
    const dimension = target.dataset['dimension'];
    const value = target.dataset['value'];
    if ((dimension !== 'cuisine' && dimension !== 'category') || value === undefined) return;
    callbacks.onFacetChange(dimension, value, target.checked);
  });

  // Close the Filters popover when clicking outside it (scoped to this bar).
  document.addEventListener('click', (event) => {
    if (filtersDd.open && !filtersDd.contains(event.target as Node)) filtersDd.removeAttribute('open');
  });

  return {
    element: toolbar,
    actionsSlot,
    sourceSlot,
    reflectView: (view) => {
      for (const [btn, mode] of [
        [viewTiles, 'tiles'],
        [viewDetails, 'details'],
      ] as const) {
        const active = view === mode;
        btn.classList.toggle('segmented-option--active', active);
        btn.setAttribute('aria-pressed', String(active));
      }
    },
    setPhotos: (photosOnly) => {
      photosToggle.checked = photosOnly;
    },
    rebuildFacets: (available, selected) => {
      const meal = renderFacetGroup({
        dimension: 'category',
        label: 'Meal',
        available: available.category,
        selected: selected.category,
      });
      const cuisine = renderFacetGroup({
        dimension: 'cuisine',
        label: 'Cuisine',
        available: available.cuisine,
        selected: selected.cuisine,
      });
      const groups = [meal, cuisine].filter((n): n is HTMLElement => n !== null);
      facetsContainer.replaceChildren(...groups);
    },
    setStatus: (text, compact) => {
      statusText = text;
      statusCompact = compact;
      applyStatus();
    },
    setResetVisible: (visible) => {
      resetBtn.hidden = !visible;
    },
    setFilterCount: (count) => {
      filtersBadge.textContent = String(count);
      filtersBadge.hidden = count <= 0;
      filtersBadge.setAttribute('aria-label', `${count} active filter${count === 1 ? '' : 's'}`);
    },
    setSearch: (q) => {
      // Cancel any pending debounced fire so a programmatic clear can't echo back.
      if (searchTimer !== undefined) clearTimeout(searchTimer);
      searchInput.value = q;
    },
  };
};
