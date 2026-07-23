// "Cookbook" settings prefs — a viewer-side display toggle for the export
// affordance beside the Cookbook title (localStorage, same defensive pattern as
// social/starter prefs). The export button is HIDDEN by default; the user opts
// in via Settings → Cookbook → "Show export". Behaviors:
// - showExport defaults to false (export button hidden)
// - setShowExport persists through storage and survives re-creation
// - storage failure (private mode) degrades to defaults, never throws
import { describe, expect, it } from 'vitest';
import { createCookbookPrefs } from '../../../src/social/cookbook-prefs.js';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
};

describe('createCookbookPrefs', () => {
  it('shows export = false by default (export button hidden)', () => {
    const prefs = createCookbookPrefs({ storage: memoryStorage() });
    expect(prefs.showExport()).toBe(false);
  });

  it('persists Show export through storage and across re-creation', () => {
    const storage = memoryStorage();
    const prefs = createCookbookPrefs({ storage });
    prefs.setShowExport(true);
    expect(prefs.showExport()).toBe(true);
    // A fresh instance over the same storage sees the choice.
    expect(createCookbookPrefs({ storage }).showExport()).toBe(true);
    prefs.setShowExport(false);
    expect(createCookbookPrefs({ storage }).showExport()).toBe(false);
  });

  it('degrades to defaults when storage throws (private mode)', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const prefs = createCookbookPrefs({ storage: broken });
    expect(prefs.showExport()).toBe(false);
    expect(() => prefs.setShowExport(true)).not.toThrow();
  });
});
