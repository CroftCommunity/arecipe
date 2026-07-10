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

describe('loadCookbookPalette', () => {
  it('maps feed entries to { uri, cid, name } and logs the load', async () => {
    const logger = recordingLogger();
    const out = await loadCookbookPalette(
      {},
      {
        resolveCookbook: async () => [],
        membersToAuthors: async () => [{ handle: 'c.test', did: 'did:c' }],
        loadAuthorsFeed: async () => ({ entries: [entry('at://d/c/soup', 'cidsoup', 'Soup')] }),
        logger,
      },
    );
    expect(out).toEqual([{ uri: 'at://d/c/soup', cid: 'cidsoup', name: 'Soup' }]);
    expect(logger.info).toHaveBeenCalledWith('meal-plan', 'palette loaded', {
      source: 'cookbook',
      count: 1,
    });
  });

  it('degrades to [] and warns when the source throws', async () => {
    const logger = recordingLogger();
    const out = await loadCookbookPalette(
      {},
      {
        resolveCookbook: async () => {
          throw new Error('appview down');
        },
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
