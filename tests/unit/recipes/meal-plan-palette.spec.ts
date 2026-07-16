// Phase 7: the palette loaders. Each maps recipe feed entries → { uri, cid,
// name } and degrades (a failed source contributes nothing, never blanks) while
// logging its seam. Hermetic via injected upstream functions + a recording
// logger (loadAuthorsFeed has no fetchFn seam, so we inject the feed fn).
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../src/log.js';
import {
  loadCookbookPalette,
  loadHandlePalette,
  loadStarterPalette,
  paginatePalette,
  type PaletteItem,
} from '../../../src/recipes/meal-plan-palette.js';

const recordingLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const entry = (uri: string, cid: string, name: unknown) => ({ uri, cid, value: { name } });

// My Cookbook = EXACTLY the Cookbook page's "Both" scope: your authored recipes
// + your liked recipes, deduped (own first). No member/reach fan-out — that
// corpus is Browse's, and mirroring it made the two sources look identical.
describe('loadCookbookPalette', () => {
  const you = { did: 'did:you', pds: 'https://pds.you.test' };
  const liked = (uri: string) => ({
    uri: `at://did:you/app.arecipe.interaction/${uri.split('/').pop() ?? 'x'}`,
    cid: 'cidint',
    kind: 'liked' as const,
    recipe: { uri, cid: 'cidref' },
    author: 'did:you',
    createdAt: '2026-07-16T00:00:00Z',
  });

  it('merges your authored + liked recipes, own first, deduped by uri', async () => {
    const logger = recordingLogger();
    const out = await loadCookbookPalette(
      { you },
      {
        readRecipes: async (target) => {
          expect(target).toEqual({ pds: you.pds, did: you.did });
          return [entry('at://did:you/c/soup', 'cidsoup', 'Soup')];
        },
        listInteractions: async (target) => {
          expect(target).toEqual({ pds: you.pds, did: you.did, kind: 'liked' });
          return [liked('at://did:other/c/pie'), liked('at://did:you/c/soup')];
        },
        likedFeed: async () => ({
          entries: [
            entry('at://did:other/c/pie', 'cidpie', 'Pie'),
            // A self-liked recipe also arrives via the authored leg — dedupe.
            entry('at://did:you/c/soup', 'cidsoup', 'Soup'),
          ],
        }),
        logger,
      },
    );
    expect(out).toEqual([
      { uri: 'at://did:you/c/soup', cid: 'cidsoup', name: 'Soup' },
      { uri: 'at://did:other/c/pie', cid: 'cidpie', name: 'Pie' },
    ]);
    expect(logger.info).toHaveBeenCalledWith('meal-plan', 'palette loaded', {
      source: 'cookbook',
      count: 2,
    });
  });

  it('is empty signed out — the cookbook is YOUR recipes, so no identity means none', async () => {
    const readRecipes = vi.fn();
    const listInteractions = vi.fn();
    const out = await loadCookbookPalette(
      {},
      { readRecipes, listInteractions, logger: recordingLogger() },
    );
    expect(out).toEqual([]);
    expect(readRecipes).not.toHaveBeenCalled();
    expect(listInteractions).not.toHaveBeenCalled();
  });

  it('degrades to authored-only (with a warn) when the liked leg fails', async () => {
    const logger = recordingLogger();
    const out = await loadCookbookPalette(
      { you },
      {
        readRecipes: async () => [entry('at://did:you/c/soup', 'cidsoup', 'Soup')],
        listInteractions: async () => {
          throw new Error('interactions listing down');
        },
        logger,
      },
    );
    expect(out).toEqual([{ uri: 'at://did:you/c/soup', cid: 'cidsoup', name: 'Soup' }]);
    expect(logger.warn).toHaveBeenCalledWith(
      'meal-plan',
      'liked palette leg failed — authored only',
      expect.objectContaining({ error: expect.stringContaining('interactions listing down') }),
    );
  });

  it('degrades to [] and warns when the authored read throws', async () => {
    const logger = recordingLogger();
    const out = await loadCookbookPalette(
      { you },
      {
        readRecipes: async () => {
          throw new Error('pds down');
        },
        listInteractions: async () => [],
        likedFeed: async () => ({ entries: [] }),
        logger,
      },
    );
    expect(out).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'meal-plan',
      'palette source failed',
      expect.objectContaining({ source: 'cookbook' }),
    );
  });
});

describe('loadStarterPalette', () => {
  it('maps the starter feed to palette items', async () => {
    const out = await loadStarterPalette({
      enabledAuthors: () => [{ handle: 'a.test', did: 'did:a' }],
      loadStarterFeed: async () => ({ entries: [entry('at://d/c/pie', 'cidpie', 'Pie')] }),
      logger: recordingLogger(),
    });
    expect(out).toEqual([{ uri: 'at://d/c/pie', cid: 'cidpie', name: 'Pie' }]);
  });

  it('degrades to [] when the starter feed throws', async () => {
    const out = await loadStarterPalette({
      loadStarterFeed: async () => {
        throw new Error('offline');
      },
      logger: recordingLogger(),
    });
    expect(out).toEqual([]);
  });
});

describe('loadHandlePalette', () => {
  it('resolves the handle and maps that cook’s recipes', async () => {
    const out = await loadHandlePalette('rdur.dev', {
      resolver: async () => ({ did: 'did:r', pds: 'https://pds.test' }),
      reader: async () => [entry('at://d/c/taco', 'cidtaco', 'Taco')],
      logger: recordingLogger(),
    });
    expect(out).toEqual([{ uri: 'at://d/c/taco', cid: 'cidtaco', name: 'Taco' }]);
  });

  it('degrades to [] when the handle does not resolve', async () => {
    const out = await loadHandlePalette('nope.invalid', {
      resolver: async () => {
        throw new Error('handle resolution failed');
      },
      logger: recordingLogger(),
    });
    expect(out).toEqual([]);
  });
});

describe('paginatePalette', () => {
  const items = (n: number): PaletteItem[] =>
    Array.from({ length: n }, (_unused, i) => ({ uri: `at://x/${i}`, cid: `c${i}`, name: `Dish ${i}` }));

  it('windows the unfiltered set to the cap and reports paging state', () => {
    const page = paginatePalette(items(25), { query: '', cap: 10, offset: 0 });
    expect(page.items).toHaveLength(10);
    expect(page.total).toBe(25);
    expect(page.start).toBe(1);
    expect(page.end).toBe(10);
    expect(page.hasPrev).toBe(false);
    expect(page.hasNext).toBe(true);
  });

  it('advances a page by the offset (forward arrow)', () => {
    const page = paginatePalette(items(25), { query: '', cap: 10, offset: 10 });
    expect(page.items[0]?.name).toBe('Dish 10');
    expect(page.start).toBe(11);
    expect(page.end).toBe(20);
    expect(page.hasPrev).toBe(true);
    expect(page.hasNext).toBe(true);
  });

  it('marks the last page (no next) with a short final window', () => {
    const page = paginatePalette(items(25), { query: '', cap: 10, offset: 20 });
    expect(page.items).toHaveLength(5);
    expect(page.start).toBe(21);
    expect(page.end).toBe(25);
    expect(page.hasNext).toBe(false);
  });

  it('filters by name (case-insensitive) and shows all matches without paging', () => {
    const page = paginatePalette(items(25), { query: 'dish 1', cap: 10, offset: 0 });
    // Dish 1, 10..19 → 11 matches; a query shows them all (no window).
    expect(page.items).toHaveLength(11);
    expect(page.total).toBe(11);
    expect(page.hasPrev).toBe(false);
    expect(page.hasNext).toBe(false);
  });

  it('clamps a stale offset that now exceeds the set to the last page', () => {
    const page = paginatePalette(items(12), { query: '', cap: 10, offset: 40 });
    expect(page.start).toBe(11);
    expect(page.end).toBe(12);
    expect(page.hasNext).toBe(false);
    expect(page.hasPrev).toBe(true);
  });

  it('reports an empty set cleanly', () => {
    const page = paginatePalette([], { query: '', cap: 10, offset: 0 });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.start).toBe(0);
    expect(page.end).toBe(0);
    expect(page.hasPrev).toBe(false);
    expect(page.hasNext).toBe(false);
  });
});

describe('name fallback', () => {
  it('uses (untitled) when an entry has no string name', async () => {
    const out = await loadStarterPalette({
      enabledAuthors: () => [{ handle: 'a.test', did: 'did:a' }],
      loadStarterFeed: async () => ({ entries: [entry('at://d/c/x', 'cidx', undefined)] }),
      logger: recordingLogger(),
    });
    expect(out[0]?.name).toBe('(untitled)');
  });
});
