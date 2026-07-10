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
