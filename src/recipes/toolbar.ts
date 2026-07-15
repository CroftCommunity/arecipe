// Shared view/filter toolbar (Phase 7), extracted from browse.ts so Browse and
// Cookbook render the identical control bar: a Tiles/Details segmented toggle, a
// Photos-only pill, Meal ▾ / Cuisine ▾ facet dropdowns, and a count block. The
// toolbar owns only its own DOM + control listeners (wired to callbacks); the
// page owns the feed/list and drives the toolbar through the returned controller
// (reflectView / setPhotos / rebuildFacets / setStatus / setResetVisible). The
// emitted class hooks + testids are byte-identical to Browse's original inline
// toolbar, so `tests/e2e/browse.spec.ts` is the behavior-preserving guard.

import type { BrowseState, ViewMode } from '../pages/browse-state.js';
import { renderFacetDropdown } from './view.js';

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

export type ToolbarController = {
  /** The `.browse-toolbar` element to mount. */
  element: HTMLElement;
  /** Reflect the active view on the segmented control (aria-pressed + class). */
  reflectView: (view: ViewMode) => void;
  /** Reflect the photos-only checkbox state (init / reset). */
  setPhotos: (photosOnly: boolean) => void;
  /** Rebuild the Meal ▾ / Cuisine ▾ dropdowns from the feed's available facets.
   *  Called when the feed changes — NOT on a facet checkbox change (so an open
   *  dropdown survives multi-select). */
  rebuildFacets: (available: FacetArrays, selected: FacetArrays) => void;
  /** Set the count/status line text. */
  setStatus: (text: string) => void;
  /** Show/hide the "reset filters ·" control (only when a filter is active). */
  setResetVisible: (visible: boolean) => void;
  /** Reflect a query value into the search box (init / reset). Display-only — it
   *  does NOT fire onQueryChange (the caller already owns the state change). */
  setSearch: (query: string) => void;
};

export const renderToolbar = (opts: {
  /** Browse shows the "set dietary preference ↗" link; Cookbook does not. */
  showDietLink?: boolean;
  callbacks: ToolbarCallbacks;
}): ToolbarController => {
  const { callbacks } = opts;
  const showDietLink = opts.showDietLink ?? false;

  const toolbar = el('div', 'browse-toolbar');
  const controls = el('div', 'browse-controls');

  // View-mode segmented control: Tiles | Details.
  const viewSegmented = el('div', 'segmented');
  const viewTiles = el('button', 'segmented-option', 'Tiles') as HTMLButtonElement;
  viewTiles.type = 'button';
  viewTiles.dataset['testid'] = 'view-tiles';
  const viewDetails = el('button', 'segmented-option', 'Details') as HTMLButtonElement;
  viewDetails.type = 'button';
  viewDetails.dataset['testid'] = 'view-details';
  viewSegmented.append(viewTiles, viewDetails);
  controls.append(viewSegmented);

  // Text search: a native search input (type=search gives the built-in clear
  // affordance). Debounced so as-you-type doesn't re-run the pipeline per key.
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'recipe-search';
  searchInput.placeholder = 'search recipes…';
  searchInput.dataset['testid'] = 'recipe-search';
  searchInput.setAttribute('aria-label', 'Search recipes');
  controls.append(searchInput);

  // Photos-only toggle: a styled checkbox pill.
  const photosToggleLabel = el('label', 'browse-toggle');
  const photosToggle = document.createElement('input');
  photosToggle.type = 'checkbox';
  photosToggle.dataset['testid'] = 'photos-only';
  photosToggleLabel.append(photosToggle, document.createTextNode('Photos only'));
  controls.append(photosToggleLabel);

  // Facet dropdowns (rebuilt from the current feed's available facets), held in
  // their own container so a facet change refreshes count+list without
  // rebuilding (and collapsing) the dropdowns.
  const facetsContainer = el('div', 'browse-facets');
  controls.append(facetsContainer);

  const countBlock = el('div', 'browse-count');
  const recipesStatus = el('p', 'status');
  recipesStatus.dataset['testid'] = 'recipes-status';
  const resetBtn = el('button', 'reset-filters-link', 'reset filters') as HTMLButtonElement;
  resetBtn.type = 'button';
  resetBtn.dataset['testid'] = 'reset-filters';
  resetBtn.hidden = true;
  const resetSep = el('span', 'reset-sep', '·');
  resetSep.hidden = true;
  // One dot-separated line: [reset filters ·] N of M shown [· set dietary preference ↗]
  countBlock.append(resetBtn, resetSep, recipesStatus);
  if (showDietLink) {
    const dietSep = el('span', 'reset-sep', '·'); // always shown: count · diet link
    const dietLink = el('a', 'diet-pref-link', 'preference ↗') as HTMLAnchorElement;
    dietLink.href = './settings.html#diet-preference';
    countBlock.append(dietSep, dietLink);
  }
  toolbar.append(controls, countBlock);

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
  // state + re-renders, leaving the dropdown open and intact.
  facetsContainer.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
    const dimension = target.dataset['dimension'];
    const value = target.dataset['value'];
    if ((dimension !== 'cuisine' && dimension !== 'category') || value === undefined) return;
    callbacks.onFacetChange(dimension, value, target.checked);
  });

  // Close an open facet dropdown when clicking outside it (scoped to this bar).
  document.addEventListener('click', (event) => {
    for (const dd of facetsContainer.querySelectorAll<HTMLDetailsElement>('details.facet-dd[open]')) {
      if (!dd.contains(event.target as Node)) dd.removeAttribute('open');
    }
  });

  return {
    element: toolbar,
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
      const meal = renderFacetDropdown({
        dimension: 'category',
        label: 'Meal',
        available: available.category,
        selected: selected.category,
      });
      const cuisine = renderFacetDropdown({
        dimension: 'cuisine',
        label: 'Cuisine',
        available: available.cuisine,
        selected: selected.cuisine,
      });
      const dropdowns = [meal, cuisine].filter((n): n is HTMLElement => n !== null);
      facetsContainer.replaceChildren(...dropdowns);
    },
    setStatus: (text) => {
      recipesStatus.textContent = text;
    },
    setResetVisible: (visible) => {
      resetBtn.hidden = !visible;
      resetSep.hidden = !visible;
    },
    setSearch: (q) => {
      // Cancel any pending debounced fire so a programmatic clear can't echo back.
      if (searchTimer !== undefined) clearTimeout(searchTimer);
      searchInput.value = q;
    },
  };
};
