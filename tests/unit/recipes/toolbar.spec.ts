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

const filtersDisclosure = (root: HTMLElement): HTMLDetailsElement =>
  root.querySelector<HTMLDetailsElement>('[data-testid="filters-dd"]')!;
const filtersBadge = (root: HTMLElement): HTMLElement =>
  root.querySelector<HTMLElement>('[data-testid="filters-count"]')!;

describe('renderToolbar — D7 single Filters disclosure', () => {
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

  it('exposes a source slot (Cookbook) and an actions slot (Browse) for page controls', () => {
    const toolbar = renderToolbar({ callbacks: noopCallbacks() });
    expect(toolbar.sourceSlot).toBeInstanceOf(HTMLElement);
    expect(toolbar.actionsSlot).toBeInstanceOf(HTMLElement);
    // Both live within the toolbar element.
    expect(toolbar.element.contains(toolbar.sourceSlot)).toBe(true);
    expect(toolbar.element.contains(toolbar.actionsSlot)).toBe(true);
  });
});
