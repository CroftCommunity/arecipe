// @vitest-environment happy-dom
// Shared toolbar — the recipe-text-search input (Phase 3). The input lives in the
// toolbar so Browse and Cookbook get the identical control; it debounces its
// onQueryChange callback (~150 ms) so as-you-type keystrokes don't re-run the
// pipeline on every character, and exposes setSearch so the shared reset can clear
// it. The reset-clears-query / offset-reset / reset-visibility behaviors are page
// wiring, guarded by the Phase 4 e2e.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToolbar, type ToolbarCallbacks } from '../../../src/recipes/toolbar.js';

const noopCallbacks = (over: Partial<ToolbarCallbacks> = {}): ToolbarCallbacks => ({
  onViewChange: () => {},
  onPhotosToggle: () => {},
  onFacetChange: () => {},
  onReset: () => {},
  onQueryChange: () => {},
  onSortChange: () => {},
  ...over,
});

const searchInput = (root: HTMLElement): HTMLInputElement =>
  root.querySelector<HTMLInputElement>('[data-testid="recipe-search"]')!;

describe('renderToolbar — search input', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders a native search input with the placeholder and testid', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const input = searchInput(toolbar.element);
    expect(input).not.toBeNull();
    expect(input.type).toBe('search');
    expect(input.placeholder).toBe('search recipes…');
  });

  it('debounces onQueryChange (~150 ms) and reports the latest value once', () => {
    const calls: string[] = [];
    const toolbar = renderToolbar({ callbacks: noopCallbacks({ onQueryChange: (q) => calls.push(q) }) });
    const input = searchInput(toolbar.element);

    input.value = 'fe';
    input.dispatchEvent(new Event('input'));
    input.value = 'fet';
    input.dispatchEvent(new Event('input'));
    input.value = 'feta';
    input.dispatchEvent(new Event('input'));
    // Nothing fires until the debounce window elapses.
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(160);
    // Exactly one call, carrying the final value.
    expect(calls).toEqual(['feta']);
  });

  it('setSearch reflects a value into the input without firing onQueryChange', () => {
    const calls: string[] = [];
    const toolbar = renderToolbar({ callbacks: noopCallbacks({ onQueryChange: (q) => calls.push(q) }) });
    const input = searchInput(toolbar.element);
    input.value = 'stew';

    toolbar.setSearch(''); // what the reset control uses to clear the box
    expect(input.value).toBe('');
    vi.advanceTimersByTime(200);
    expect(calls).toEqual([]); // programmatic clear must not echo back as a query
  });
});

/** Replace window.matchMedia with a controllable stub: `fire(matches)` flips the
 *  state and notifies the toolbar's change listener, like a real viewport cross. */
const stubMatchMedia = (matches: boolean): { fire: (matches: boolean) => void } => {
  const state = { matches };
  const listeners: ((ev: MediaQueryListEvent) => void)[] = [];
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return state.matches;
        },
        media: query,
        addEventListener: (_type: string, cb: (ev: MediaQueryListEvent) => void) => listeners.push(cb),
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  return {
    fire: (next) => {
      state.matches = next;
      for (const cb of listeners) cb({ matches: next } as MediaQueryListEvent);
    },
  };
};

const filtersDisclosure = (root: HTMLElement): HTMLDetailsElement =>
  root.querySelector<HTMLDetailsElement>('[data-testid="filters-dd"]')!;
const filtersBadge = (root: HTMLElement): HTMLElement =>
  root.querySelector<HTMLElement>('[data-testid="filters-count"]')!;

describe('renderToolbar — D7 single Filters disclosure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('collapses photos + facets behind one Filters ▾ disclosure (reset lives outside it)', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const dd = filtersDisclosure(toolbar.element);
    expect(dd).not.toBeNull();
    // Photos-only and the facet container live INSIDE the disclosure.
    expect(dd.querySelector('[data-testid="photos-only"]')).not.toBeNull();
    // Reset-surface v2 (D4): reset is NO LONGER inside the popover — it moves to
    // the honest-count block so an active filter shows a one-tap clear in sight.
    expect(dd.querySelector('[data-testid="reset-filters"]')).toBeNull();
    // The search input and view toggle stay OUTSIDE the disclosure (rows 1/3).
    expect(dd.querySelector('[data-testid="recipe-search"]')).toBeNull();
    expect(dd.querySelector('[data-testid="view-tiles"]')).toBeNull();
  });

  it('shows the diet link inside the disclosure only when showDietLink is set', () => {
    const withDiet = renderToolbar({ showDietLink: true, callbacks: noopCallbacks() });
    expect(filtersDisclosure(withDiet.element).querySelector('.diet-pref-link')).not.toBeNull();
    const without = renderToolbar({ callbacks: noopCallbacks() });
    expect(filtersDisclosure(without.element).querySelector('.diet-pref-link')).toBeNull();
  });

  it('renders Meal / Cuisine facet groups inside the disclosure on rebuildFacets', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    toolbar.rebuildFacets(
      { cuisine: ['Italian', 'Thai'], category: ['Dessert'] },
      { cuisine: ['Thai'], category: [] },
    );
    const dd = filtersDisclosure(toolbar.element);
    const boxes = dd.querySelectorAll('input[type="checkbox"][data-dimension]');
    expect(boxes.length).toBe(3); // 2 cuisine + 1 category, all inside the popover
    const thai = dd.querySelector<HTMLInputElement>('input[data-dimension="cuisine"][data-value="Thai"]')!;
    expect(thai.checked).toBe(true);
  });

  it('setFilterCount drives the count badge, hidden at zero', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const badge = filtersBadge(toolbar.element);
    expect(badge.hidden).toBe(true);
    toolbar.setFilterCount(2);
    expect(badge.textContent).toBe('2');
    expect(badge.hidden).toBe(false);
    toolbar.setFilterCount(0);
    expect(badge.hidden).toBe(true);
  });

  it('mounts reset in the count block, before the honest status, as the shared icon button', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const countBlock = toolbar.element.querySelector<HTMLElement>('.browse-count')!;
    const reset = countBlock.querySelector<HTMLButtonElement>('[data-testid="reset-filters"]')!;
    expect(reset).not.toBeNull();
    // It is the shared icon-button helper: icon-only, labelled, class-shared.
    expect(reset.tagName.toLowerCase()).toBe('button');
    expect(reset.classList.contains('reset-icon-btn')).toBe(true);
    expect(reset.getAttribute('aria-label')).toBe('reset filters');
    expect(reset.querySelector('svg')).not.toBeNull();
    // Ordered before the honest count so it reads "reset · N of M shown".
    const status = countBlock.querySelector<HTMLElement>('[data-testid="recipes-status"]')!;
    expect(reset.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('setResetVisible toggles the relocated reset; hidden by default', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const reset = toolbar.element.querySelector<HTMLButtonElement>('[data-testid="reset-filters"]')!;
    expect(reset.hidden).toBe(true); // no active filter → no reset
    toolbar.setResetVisible(true);
    expect(reset.hidden).toBe(false);
    toolbar.setResetVisible(false);
    expect(reset.hidden).toBe(true);
  });

  it('clicking the relocated reset fires onReset', () => {
    let fired = 0;
    const toolbar = renderToolbar({ callbacks: noopCallbacks({ onReset: () => (fired += 1) }) });
    const reset = toolbar.element.querySelector<HTMLButtonElement>('[data-testid="reset-filters"]')!;
    reset.click();
    expect(fired).toBe(1);
  });

  it('setStatus shows the full text at desktop widths even when a compact form is given', () => {
    const { fire } = stubMatchMedia(false);
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const status = toolbar.element.querySelector<HTMLElement>('[data-testid="recipes-status"]')!;
    toolbar.setStatus('3 of 12 recipes', '3/12');
    expect(status.textContent).toBe('3 of 12 recipes');
    // Crossing INTO the phone breakpoint re-picks the compact form live.
    fire(true);
    expect(status.textContent).toBe('3/12');
  });

  it('setStatus shows the compact form at phone widths, full text when none is given', () => {
    const { fire } = stubMatchMedia(true);
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const status = toolbar.element.querySelector<HTMLElement>('[data-testid="recipes-status"]')!;
    toolbar.setStatus('3 of 12 recipes', '3/12');
    expect(status.textContent).toBe('3/12');
    // No compact variant (the unfiltered "N recipes") → the full text everywhere.
    toolbar.setStatus('12 recipes');
    expect(status.textContent).toBe('12 recipes');
    // Crossing OUT of the phone breakpoint restores the full text.
    toolbar.setStatus('3 of 12 recipes', '3/12');
    fire(false);
    expect(status.textContent).toBe('3 of 12 recipes');
  });

  it('exposes a source slot (Cookbook) and an actions slot (Browse) for page controls', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    expect(toolbar.sourceSlot).toBeInstanceOf(HTMLElement);
    expect(toolbar.actionsSlot).toBeInstanceOf(HTMLElement);
    // Both live within the toolbar element.
    expect(toolbar.element.contains(toolbar.sourceSlot)).toBe(true);
    expect(toolbar.element.contains(toolbar.actionsSlot)).toBe(true);
  });
});

// Two-row layout (owner mobile feedback 2026-07-16): the source control (the
// Cookbook Mine | Liked | Both segmented) rides the SEARCH row — you search the
// selected context on one line — and the controls row below holds Tiles |
// Details + Filters ▾ on the left with reset (when active) + count on the right.
describe('renderToolbar — source control on the search row', () => {
  it('mounts the source slot on the search row, before the search input (actions slot last)', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const searchRow = toolbar.element.querySelector('.toolbar-row--search')!;
    expect(searchRow.contains(toolbar.sourceSlot)).toBe(true);
    // A page-mounted source control leads the row, the search input follows:
    // [Mine | Liked | Both][search input][page actions].
    const seg = document.createElement('div');
    toolbar.sourceSlot.append(seg);
    const input = searchRow.querySelector('[data-testid="recipe-search"]')!;
    expect((seg.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    expect((input.compareDocumentPosition(toolbar.actionsSlot) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it('renders exactly two rows: [search + source + actions] and [view toggle + Filters + reset + count]', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const rows = toolbar.element.querySelectorAll('.toolbar-row');
    expect(rows.length).toBe(2);
    // No dedicated source row remains.
    expect(toolbar.element.querySelector('.toolbar-row--source')).toBeNull();
    // The controls row carries the whole second line.
    const controls = toolbar.element.querySelector('.toolbar-row--controls')!;
    expect(controls.querySelector('[data-testid="view-tiles"]')).not.toBeNull();
    expect(controls.querySelector('[data-testid="filters-dd"]')).not.toBeNull();
    expect(controls.querySelector('[data-testid="reset-filters"]')).not.toBeNull();
    expect(controls.querySelector('[data-testid="recipes-status"]')).not.toBeNull();
  });

  it('orders the controls row: view toggle, then Filters ▾, then the reset + count block', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const controls = toolbar.element.querySelector('.toolbar-row--controls')!;
    const tiles = controls.querySelector('[data-testid="view-tiles"]')!;
    const filters = controls.querySelector('[data-testid="filters-dd"]')!;
    const count = controls.querySelector('.browse-count')!;
    expect((tiles.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    expect((filters.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });
});

// The Sort control (owner ask 2026-07-23): an icon-only disclosure squeezed onto
// the controls row, between Filters ▾ and the count. A radio list of the five
// modes (Daily mix default + name/date/cuisine/meal); picking one fires
// onSortChange and closes the popover.
const sortDisclosure = (root: HTMLElement): HTMLDetailsElement =>
  root.querySelector<HTMLDetailsElement>('[data-testid="sort-dd"]')!;
const sortRadio = (root: HTMLElement, mode: string): HTMLInputElement =>
  root.querySelector<HTMLInputElement>(`[data-testid="sort-dd"] input[data-sort="${mode}"]`)!;

describe('renderToolbar — Sort control', () => {
  it('mounts a sort disclosure on the controls row, after Filters ▾ and before the count', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const controls = toolbar.element.querySelector('.toolbar-row--controls')!;
    const sort = sortDisclosure(toolbar.element);
    expect(sort).not.toBeNull();
    expect(controls.contains(sort)).toBe(true);
    const filters = controls.querySelector('[data-testid="filters-dd"]')!;
    const count = controls.querySelector('.browse-count')!;
    expect((filters.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    expect((sort.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it('is a symbol button: the summary carries an accessible name and an inline icon', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const summary = sortDisclosure(toolbar.element).querySelector('summary')!;
    expect(summary.getAttribute('aria-label')).toBe('Sort recipes');
    expect(summary.getAttribute('title')).toBe('Sort recipes');
    expect(summary.querySelector('svg')).not.toBeNull();
  });

  it('offers the five modes as a single-select radio group, Daily mix default checked', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    const dd = sortDisclosure(toolbar.element);
    const radios = dd.querySelectorAll<HTMLInputElement>('input[type="radio"][data-sort]');
    expect([...radios].map((r) => r.dataset['sort'])).toEqual(['default', 'name', 'date', 'cuisine', 'meal']);
    // All share one radio group name (single-select).
    expect(new Set([...radios].map((r) => r.name)).size).toBe(1);
    // The default is reflected as checked out of the box.
    expect(sortRadio(toolbar.element, 'default').checked).toBe(true);
  });

  it('fires onSortChange with the picked mode and closes the popover', () => {
    const picks: string[] = [];
    const toolbar = renderToolbar({ callbacks: noopCallbacks({ onSortChange: (m) => picks.push(m) }) });
    const dd = sortDisclosure(toolbar.element);
    dd.open = true;
    const date = sortRadio(toolbar.element, 'date');
    date.checked = true;
    date.dispatchEvent(new Event('change', { bubbles: true }));
    expect(picks).toEqual(['date']);
    expect(dd.open).toBe(false);
  });

  it('setSort reflects the active mode onto the radios (init / persistence)', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    toolbar.setSort('cuisine');
    expect(sortRadio(toolbar.element, 'cuisine').checked).toBe(true);
    expect(sortRadio(toolbar.element, 'default').checked).toBe(false);
    // The summary reflects a non-default sort with an "active" marker class.
    const summary = sortDisclosure(toolbar.element).querySelector('summary')!;
    expect(summary.classList.contains('facet-dd-summary--active')).toBe(true);
    toolbar.setSort('default');
    expect(summary.classList.contains('facet-dd-summary--active')).toBe(false);
  });
});
