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
