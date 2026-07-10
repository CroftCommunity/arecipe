// @vitest-environment happy-dom
// Phase 2: the reusable cook-typeahead UI. attachActorTypeahead wires an
// existing <input> to a debounced, accessible listbox of ActorSuggestions and
// calls onSelect when the user picks one. Behaviors under test:
// - below minChars: no search, no dropdown
// - at/above minChars: debounced single search, one option per result
// - an in-flight search superseded by a newer query never renders its results
//   (generation guard) — the stale resolution is ignored
// - ArrowDown + Enter selects the active option (fires onSelect, fills input)
// - Escape closes; clicking an option selects it
// - the combobox/listbox ARIA wiring is present
// - destroy() unbinds and removes the dropdown
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachActorTypeahead } from '../../../src/identity/actor-typeahead.js';
import type { ActorSuggestion } from '../../../src/identity/actor-search.js';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const A: ActorSuggestion = { did: 'did:plc:aaa', handle: 'alice.cooks', displayName: 'Alice' };
const B: ActorSuggestion = { did: 'did:plc:bbb', handle: 'bob.bakes', displayName: 'Bob', avatar: 'https://cdn.bsky.app/x.jpg' };

/** A search double: records queries and hands back a deferred promise per call
 * so the test controls resolution order (for the supersession case). */
const deferredSearch = () => {
  const calls: string[] = [];
  const resolvers: ((v: ActorSuggestion[]) => void)[] = [];
  const search = (q: string): Promise<ActorSuggestion[]> => {
    calls.push(q);
    return new Promise<ActorSuggestion[]>((resolve) => resolvers.push(resolve));
  };
  return { search, calls, resolvers };
};

/** A search double that resolves immediately with a fixed list. */
const instantSearch = (results: ActorSuggestion[]) => {
  const calls: string[] = [];
  const search = (q: string): Promise<ActorSuggestion[]> => {
    calls.push(q);
    return Promise.resolve(results);
  };
  return { search, calls };
};

const mkInput = (): HTMLInputElement => {
  const input = document.createElement('input');
  input.type = 'text';
  document.body.append(input);
  return input;
};

const type = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const press = (input: HTMLInputElement, key: string): void => {
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};

const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role=option]')];

afterEach(() => {
  document.body.replaceChildren();
});

describe('attachActorTypeahead', () => {
  it('does not search below minChars', async () => {
    const input = mkInput();
    const { search, calls } = instantSearch([A]);
    attachActorTypeahead({ input, onSelect: vi.fn(), search, debounceMs: 0, minChars: 2 });

    type(input, 'a');
    await tick();

    expect(calls).toEqual([]);
    expect(options()).toHaveLength(0);
  });

  it('searches once after the debounce and renders one option per result', async () => {
    const input = mkInput();
    const { search, calls } = instantSearch([A, B]);
    attachActorTypeahead({ input, onSelect: vi.fn(), search, debounceMs: 0, minChars: 2 });

    type(input, 'al');
    await tick();
    await tick();

    expect(calls).toEqual(['al']);
    const opts = options();
    expect(opts).toHaveLength(2);
    expect(opts[0]?.textContent).toContain('alice.cooks');
    expect(opts[1]?.textContent).toContain('bob.bakes');
  });

  it('renders the avatar when a suggestion has one', async () => {
    const input = mkInput();
    const { search } = instantSearch([B]);
    attachActorTypeahead({ input, onSelect: vi.fn(), search, debounceMs: 0 });

    type(input, 'bo');
    await tick();
    await tick();

    const img = document.querySelector<HTMLImageElement>('[role=option] img');
    expect(img?.getAttribute('src')).toBe('https://cdn.bsky.app/x.jpg');
  });

  it('ignores a superseded in-flight search (only the latest query renders)', async () => {
    const input = mkInput();
    const { search, calls, resolvers } = deferredSearch();
    attachActorTypeahead({ input, onSelect: vi.fn(), search, debounceMs: 0 });

    type(input, 'al'); // fires search #0 (slow)
    await tick();
    type(input, 'bob'); // fires search #1 (fast)
    await tick();
    expect(calls).toEqual(['al', 'bob']);

    // Resolve the NEWER query first, then the older one.
    resolvers[1]?.([B]);
    await tick();
    resolvers[0]?.([A]); // stale — must be ignored
    await tick();

    const opts = options();
    expect(opts).toHaveLength(1);
    expect(opts[0]?.textContent).toContain('bob.bakes');
  });

  it('ArrowDown + Enter selects the active option, fires onSelect, fills the input, closes', async () => {
    const input = mkInput();
    const onSelect = vi.fn();
    const { search } = instantSearch([A, B]);
    attachActorTypeahead({ input, onSelect, search, debounceMs: 0 });

    type(input, 'al');
    await tick();
    await tick();

    press(input, 'ArrowDown'); // activate first
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[0]?.id);

    press(input, 'Enter');
    expect(onSelect).toHaveBeenCalledWith(A);
    expect(input.value).toBe('alice.cooks');
    expect(options()).toHaveLength(0); // closed
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('ArrowDown twice moves the active option to the second result', async () => {
    const input = mkInput();
    const onSelect = vi.fn();
    const { search } = instantSearch([A, B]);
    attachActorTypeahead({ input, onSelect, search, debounceMs: 0 });

    type(input, 'al');
    await tick();
    await tick();

    press(input, 'ArrowDown');
    press(input, 'ArrowDown');
    press(input, 'Enter');
    expect(onSelect).toHaveBeenCalledWith(B);
  });

  it('Escape closes the dropdown without selecting', async () => {
    const input = mkInput();
    const onSelect = vi.fn();
    const { search } = instantSearch([A, B]);
    attachActorTypeahead({ input, onSelect, search, debounceMs: 0 });

    type(input, 'al');
    await tick();
    await tick();
    expect(options()).toHaveLength(2);

    press(input, 'Escape');
    expect(options()).toHaveLength(0);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clicking an option selects it', async () => {
    const input = mkInput();
    const onSelect = vi.fn();
    const { search } = instantSearch([A, B]);
    attachActorTypeahead({ input, onSelect, search, debounceMs: 0 });

    type(input, 'bo');
    await tick();
    await tick();

    options()[1]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith(B);
    expect(input.value).toBe('bob.bakes');
  });

  it('wires the combobox/listbox ARIA relationship', async () => {
    const input = mkInput();
    const { search } = instantSearch([A]);
    attachActorTypeahead({ input, onSelect: vi.fn(), search, debounceMs: 0 });

    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');

    type(input, 'al');
    await tick();
    await tick();

    const listbox = document.querySelector('[role=listbox]');
    expect(listbox).not.toBeNull();
    expect(input.getAttribute('aria-controls')).toBe(listbox?.id);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('destroy() unbinds input handling and removes the dropdown', async () => {
    const input = mkInput();
    const { search, calls } = instantSearch([A]);
    const handle = attachActorTypeahead({ input, onSelect: vi.fn(), search, debounceMs: 0 });

    type(input, 'al');
    await tick();
    await tick();
    expect(options()).toHaveLength(1);

    handle.destroy();
    expect(document.querySelector('[role=listbox]')).toBeNull();

    type(input, 'ali'); // should no longer trigger a search
    await tick();
    await tick();
    expect(calls).toEqual(['al']); // no new call after destroy
  });
});
