// Phase 9a: the multi-author feed loader extracted from starter.ts into
// src/social/feed.ts so both the starter pack and the friends feed call one
// loader (behavior-preserving move — the starter suite is the guard). The
// generic contract: per-author failure degrades to cached copies first
// (offline survival, 8b) and only reports an author fully unavailable when
// nothing is cached. Never blanks the feed.
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { loadAuthorsFeed, type FeedAuthor } from '../../../src/social/feed.js';
import { createRecipeCache } from '../../../src/recipes/cache.js';

const AUTHOR_A: FeedAuthor = { handle: 'a.example.com', did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa' };
const AUTHOR_B: FeedAuthor = { handle: 'b.example.com', did: 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb' };

describe('loadAuthorsFeed offline fallback', () => {
  it('serves an author from the cache when the network fails', async () => {
    const cache = createRecipeCache();
    await cache.put({
      uri: `at://${AUTHOR_A.did}/exchange.recipe.recipe/seeded`,
      cid: 'bafyreiseededfeed',
      value: {
        name: 'Cached Feed One',
        text: 't',
        ingredients: ['i'],
        instructions: ['s'],
        createdAt: '2026-07-08T00:00:00Z',
        updatedAt: '2026-07-08T00:00:00Z',
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const feed = await loadAuthorsFeed([AUTHOR_A]);
    vi.unstubAllGlobals();
    expect(feed.cachedAuthors).toContain(AUTHOR_A.handle);
    expect(feed.failedAuthors).not.toContain(AUTHOR_A.handle);
    expect(feed.entries.map((e) => (e.value as { name?: string }).name)).toContain('Cached Feed One');
  });

  it('reports an author unavailable only when nothing is cached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const feed = await loadAuthorsFeed([AUTHOR_B]);
    vi.unstubAllGlobals();
    expect(feed.failedAuthors).toContain(AUTHOR_B.handle);
    expect(feed.cachedAuthors).not.toContain(AUTHOR_B.handle);
    expect(feed.entries).toHaveLength(0);
  });

  it('maps each author DID to its handle for per-card attribution', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const feed = await loadAuthorsFeed([AUTHOR_A, AUTHOR_B]);
    vi.unstubAllGlobals();
    expect(feed.authorsByDid[AUTHOR_A.did]).toBe(AUTHOR_A.handle);
    expect(feed.authorsByDid[AUTHOR_B.did]).toBe(AUTHOR_B.handle);
  });
});
