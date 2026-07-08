// Phase 5e: the starter pack. Behaviors:
// - the curated set contains rdur.dev (user-picked default) and at least
//   two more authors with real content
// - every author is enabled by default
// - toggling persists through the provided storage and survives re-creation
// - storage failure degrades to defaults (never crashes)
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createStarterPrefs, loadStarterFeed, STARTER_AUTHORS } from '../../../src/recipes/starter.js';
import { createRecipeCache } from '../../../src/recipes/cache.js';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
};

describe('STARTER_AUTHORS', () => {
  it('contains rdur.dev plus at least two more, each with handle + did', () => {
    const handles = STARTER_AUTHORS.map((a) => a.handle);
    expect(handles).toContain('rdur.dev');
    expect(STARTER_AUTHORS.length).toBeGreaterThanOrEqual(3);
    for (const author of STARTER_AUTHORS) {
      expect(author.did).toMatch(/^did:plc:/);
      expect(author.handle.length).toBeGreaterThan(0);
    }
  });
});

describe('createStarterPrefs', () => {
  it('enables every author by default', () => {
    const prefs = createStarterPrefs({ storage: memoryStorage() });
    for (const author of STARTER_AUTHORS) {
      expect(prefs.isEnabled(author.handle)).toBe(true);
    }
    expect(prefs.enabledAuthors()).toHaveLength(STARTER_AUTHORS.length);
  });

  it('persists a toggle through the storage', () => {
    const storage = memoryStorage();
    const prefs = createStarterPrefs({ storage });
    prefs.setEnabled('rdur.dev', false);
    expect(prefs.isEnabled('rdur.dev')).toBe(false);
    // A fresh instance over the same storage sees the choice.
    const again = createStarterPrefs({ storage });
    expect(again.isEnabled('rdur.dev')).toBe(false);
    expect(again.enabledAuthors().map((a) => a.handle)).not.toContain('rdur.dev');
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
    const prefs = createStarterPrefs({ storage: broken });
    expect(prefs.isEnabled('rdur.dev')).toBe(true);
    expect(() => prefs.setEnabled('rdur.dev', false)).not.toThrow();
  });
});

describe('loadStarterFeed offline fallback', () => {
  it('serves an author from the cache when the network fails', async () => {
    const author = STARTER_AUTHORS[0]!;
    // Pre-seed the default cache with a record for this author.
    const cache = createRecipeCache(); // dbName 'arecipe'
    await cache.put({
      uri: `at://${author.did}/exchange.recipe.recipe/seeded`,
      cid: 'bafyreiseeded',
      value: {
        name: 'Cached One',
        text: 't',
        ingredients: ['i'],
        instructions: ['s'],
        createdAt: '2026-07-08T00:00:00Z',
        updatedAt: '2026-07-08T00:00:00Z',
      },
    });
    // All network dead.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const feed = await loadStarterFeed([author]);
    vi.unstubAllGlobals();
    expect(feed.cachedAuthors).toContain(author.handle);
    expect(feed.failedAuthors).not.toContain(author.handle);
    expect(feed.entries.map((e) => (e.value as { name?: string }).name)).toContain('Cached One');
  });

  it('reports an author unavailable only when nothing is cached', async () => {
    const author = STARTER_AUTHORS[2]!; // no seeded records for this one
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const feed = await loadStarterFeed([author]);
    vi.unstubAllGlobals();
    expect(feed.failedAuthors).toContain(author.handle);
    expect(feed.cachedAuthors).not.toContain(author.handle);
    expect(feed.entries).toHaveLength(0);
  });
});
