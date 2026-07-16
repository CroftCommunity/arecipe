// Account danger zone — the data wipe (plan 2026-07-16-5). PDS side: only
// app.arecipe.* collections are enumerated (describeRepo) and deleted
// (listRecords pages → applyWrites batches); exchange.recipe.* and app.bsky.*
// survive BY CONSTRUCTION (prefix filter). Local side: localStorage cleared,
// our two IndexedDB databases deleted, only arecipe-* CacheStorage entries
// dropped. A wipe is not a sign-out — nothing here touches the OAuth store.
import type { Agent } from '@atproto/api';
import { describe, expect, it, vi } from 'vitest';
import {
  ARECIPE_DBS,
  ARECIPE_NSID_PREFIX,
  listArecipeCollections,
  wipeLocalData,
  wipePdsArecipeData,
} from '../../../src/account/wipe.js';

const DID = 'did:plc:wipeme000000000000000000';

type ListPage = { records: { uri: string }[]; cursor?: string };

/** Fake agent: describeRepo → the given collections; listRecords serves the
 * given pages per collection; applyWrites/deleteRecord calls are captured. */
const fakeAgent = (
  collections: string[],
  pagesByCollection: Record<string, ListPage[]>,
): {
  agent: Agent;
  applyWrites: ReturnType<typeof vi.fn>;
} => {
  const applyWrites = vi.fn().mockResolvedValue({ data: {} });
  const pageIndex = new Map<string, number>();
  const listRecords = vi.fn().mockImplementation((params: { collection: string }) => {
    const pages = pagesByCollection[params.collection] ?? [{ records: [] }];
    const i = pageIndex.get(params.collection) ?? 0;
    pageIndex.set(params.collection, i + 1);
    const page = pages[Math.min(i, pages.length - 1)] ?? { records: [] };
    return Promise.resolve({ data: page });
  });
  const describeRepo = vi.fn().mockResolvedValue({ data: { collections } });
  const agent = {
    did: DID,
    com: { atproto: { repo: { describeRepo, listRecords, applyWrites } } },
  } as unknown as Agent;
  return { agent, applyWrites };
};

const uris = (collection: string, n: number, from = 0): { uri: string }[] =>
  Array.from({ length: n }, (_, i) => ({ uri: `at://${DID}/${collection}/rkey${from + i}` }));

describe('listArecipeCollections', () => {
  it('keeps only the app.arecipe.* prefix — exchange.recipe and app.bsky survive', async () => {
    const { agent } = fakeAgent(
      [
        'app.arecipe.mealPlan',
        'exchange.recipe.recipe',
        'app.bsky.actor.profile',
        'app.arecipe.draft',
        'app.bsky.graph.follow',
      ],
      {},
    );
    await expect(listArecipeCollections(agent, DID)).resolves.toEqual([
      'app.arecipe.mealPlan',
      'app.arecipe.draft',
    ]);
    expect(ARECIPE_NSID_PREFIX).toBe('app.arecipe.');
  });
});

describe('wipePdsArecipeData', () => {
  it('deletes every record of every app.arecipe.* collection and nothing else', async () => {
    const { agent, applyWrites } = fakeAgent(
      ['app.arecipe.mealPlan', 'exchange.recipe.recipe', 'app.arecipe.interaction'],
      {
        'app.arecipe.mealPlan': [{ records: uris('app.arecipe.mealPlan', 2) }],
        'app.arecipe.interaction': [{ records: uris('app.arecipe.interaction', 1) }],
        'exchange.recipe.recipe': [{ records: uris('exchange.recipe.recipe', 3) }],
      },
    );
    const total = await wipePdsArecipeData(agent);
    expect(total).toBe(3);
    const calls = applyWrites.mock.calls as [
      { repo: string; writes: { collection: string; rkey: string }[] },
    ][];
    const written = calls.flatMap(([params]) => {
      expect(params.repo).toBe(DID);
      return params.writes;
    });
    expect(written.map((w) => w.collection).sort()).toEqual([
      'app.arecipe.interaction',
      'app.arecipe.mealPlan',
      'app.arecipe.mealPlan',
    ]);
    expect(written.every((w) => w.collection.startsWith(ARECIPE_NSID_PREFIX))).toBe(true);
  });

  it('follows listRecords cursors to the end of a collection', async () => {
    const { agent, applyWrites } = fakeAgent(['app.arecipe.comment'], {
      'app.arecipe.comment': [
        { records: uris('app.arecipe.comment', 2), cursor: 'page2' },
        { records: uris('app.arecipe.comment', 2, 2) },
      ],
    });
    const total = await wipePdsArecipeData(agent);
    expect(total).toBe(4);
    const calls = applyWrites.mock.calls as [{ writes: { rkey: string }[] }][];
    const rkeys = calls.flatMap(([params]) => params.writes.map((w) => w.rkey));
    expect(rkeys).toEqual(['rkey0', 'rkey1', 'rkey2', 'rkey3']);
  });

  it('chunks deletes into applyWrites batches of at most 200', async () => {
    const { agent, applyWrites } = fakeAgent(['app.arecipe.draft'], {
      'app.arecipe.draft': [{ records: uris('app.arecipe.draft', 250) }],
    });
    await wipePdsArecipeData(agent);
    const calls = applyWrites.mock.calls as [{ writes: unknown[] }][];
    const sizes = calls.map(([params]) => params.writes.length);
    expect(sizes).toEqual([200, 50]);
  });

  it('reports progress and skips applyWrites entirely for an empty repo', async () => {
    const { agent, applyWrites } = fakeAgent(['app.arecipe.mealPlan'], {
      'app.arecipe.mealPlan': [{ records: [] }],
    });
    const onProgress = vi.fn();
    await expect(wipePdsArecipeData(agent, onProgress)).resolves.toBe(0);
    expect(applyWrites).not.toHaveBeenCalled();

    const { agent: agent2 } = fakeAgent(['app.arecipe.mealPlan'], {
      'app.arecipe.mealPlan': [{ records: uris('app.arecipe.mealPlan', 1) }],
    });
    await wipePdsArecipeData(agent2, onProgress);
    expect(onProgress).toHaveBeenCalled();
  });

  it('fails loud without a signed-in DID', async () => {
    const agent = { com: { atproto: { repo: {} } } } as unknown as Agent;
    await expect(wipePdsArecipeData(agent)).rejects.toThrow(/signed-in/);
  });
});

describe('wipeLocalData', () => {
  it('clears storage, deletes our IndexedDB databases, and drops only arecipe-* caches', async () => {
    const clear = vi.fn();
    const deleted: string[] = [];
    const indexedDb = {
      deleteDatabase: (name: string) => {
        deleted.push(name);
        const req = { onsuccess: null as null | (() => void), onerror: null, onblocked: null };
        queueMicrotask(() => req.onsuccess?.());
        return req as unknown as IDBOpenDBRequest;
      },
    };
    const dropped: string[] = [];
    const cacheStore = {
      keys: () => Promise.resolve(['arecipe-v3', 'other-app-v1', 'arecipe-v2']),
      delete: (name: string) => {
        dropped.push(name);
        return Promise.resolve(true);
      },
    };
    await wipeLocalData({ storage: { clear }, indexedDb, cacheStore });
    expect(clear).toHaveBeenCalledOnce();
    expect(deleted).toEqual([...ARECIPE_DBS]);
    expect(deleted).toContain('arecipe');
    expect(deleted).toContain('arecipe-drafts');
    expect(dropped.sort()).toEqual(['arecipe-v2', 'arecipe-v3']);
  });

  it('does not hang when a database deletion is blocked by another tab', async () => {
    const indexedDb = {
      deleteDatabase: () => {
        const req = { onsuccess: null, onerror: null, onblocked: null as null | (() => void) };
        queueMicrotask(() => req.onblocked?.());
        return req as unknown as IDBOpenDBRequest;
      },
    };
    await expect(
      wipeLocalData({
        storage: { clear: vi.fn() },
        indexedDb,
        cacheStore: { keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) },
      }),
    ).resolves.toBeUndefined();
  });
});
