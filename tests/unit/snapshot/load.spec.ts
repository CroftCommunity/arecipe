// D2: the boot loader. index.json + shards come from the precached bundle
// (same-origin, immutable), so first paint needs no PDS network. A corrupt or
// truncated snapshot must degrade to null (→ live loading) with a single log,
// never a throw and never a blank screen.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { loadSnapshotIndex, loadCookShard, loadSnapshotFeed } from '../../../src/snapshot/load.js';
import { createRecipeCache } from '../../../src/recipes/cache.js';
import { createSnapshotStore } from '../../../src/snapshot/store.js';
import { createLogger, type LogSink } from '../../../src/log.js';

const DID_A = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const DID_B = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';

const rec = (did: string, rkey: string, name: string) => ({
  uri: `at://${did}/exchange.recipe.recipe/${rkey}`,
  cid: `bafyrei${rkey}`,
  value: {
    name,
    text: 't',
    ingredients: ['i'],
    instructions: ['s'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
});

const index = {
  buildId: 'dev',
  cooks: [
    {
      did: DID_A,
      handle: 'a.example.com',
      displayName: 'Alice',
      recipes: [
        { rkey: 'a1', title: 'Apple' },
        { rkey: 'a2', title: 'Bread' },
      ],
    },
    { did: DID_B, handle: 'b.example.com', displayName: 'Bob', recipes: [{ rkey: 'b1', title: 'Cake' }] },
  ],
};
const shardA = { did: DID_A, handle: 'a.example.com', rev: 'ra', cid: 'ca', part: 0, records: [rec(DID_A, 'a1', 'Apple'), rec(DID_A, 'a2', 'Bread')] };
const shardB = { did: DID_B, handle: 'b.example.com', rev: 'rb', cid: 'cb', part: 0, records: [rec(DID_B, 'b1', 'Cake')] };

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

/** A fake bundle server: index.json + per-cook shard files. */
const bundleFetch = (): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/index.json')) return okJson(index);
    if (url.endsWith(`/cooks/${DID_A}.json`)) return okJson(shardA);
    if (url.endsWith(`/cooks/${DID_B}.json`)) return okJson(shardB);
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;

const makeSink = () => {
  const lines: string[] = [];
  const grab = (m: string) => (...a: unknown[]) => lines.push(`${m}|${a.slice(0, 2).join(' ')}`);
  return { lines, sink: { log: grab('log'), info: grab('info'), warn: grab('warn'), error: grab('error') } as LogSink };
};

describe('loadSnapshotIndex', () => {
  it('parses a good index', async () => {
    const idx = await loadSnapshotIndex({ fetchFn: bundleFetch(), url: './assets/snapshot/dev/index.json' });
    expect(idx?.cooks).toHaveLength(2);
  });

  it('returns null and logs once on a corrupt/truncated index (no throw, no blank)', async () => {
    const { lines, sink } = makeSink();
    const logger = createLogger({ debug: false, sink });
    const truncated = (async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected end of JSON'); } })) as unknown as typeof fetch;
    const idx = await loadSnapshotIndex({ fetchFn: truncated, url: 'x', logger });
    expect(idx).toBeNull();
    expect(lines.filter((l) => l.startsWith('warn|')).length).toBe(1);
  });

  it('returns null when the index is missing (404)', async () => {
    const notFound = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await loadSnapshotIndex({ fetchFn: notFound, url: 'x' })).toBeNull();
  });
});

describe('loadCookShard', () => {
  it('loads a shard by url', async () => {
    const shard = await loadCookShard({ fetchFn: bundleFetch(), url: `./assets/snapshot/dev/cooks/${DID_A}.json` });
    expect(shard?.records).toHaveLength(2);
    expect(shard?.rev).toBe('ra');
  });
});

describe('loadSnapshotFeed', () => {
  it('reconstructs a full, CID-verified feed from index + shards with no PDS calls', async () => {
    const cache = createRecipeCache({ dbName: `snap-feed-${Math.random()}` });
    const feed = await loadSnapshotFeed({ fetchFn: bundleFetch(), cache, buildId: 'dev' });
    expect(feed).not.toBeNull();
    expect(feed!.entries).toHaveLength(3);
    expect(feed!.authorsByDid[DID_A]).toBe('a.example.com');
    expect(feed!.entries.map((e) => (e.value as { name?: string }).name).sort()).toEqual(['Apple', 'Bread', 'Cake']);
  });

  it('returns null when there is no snapshot (empty index) so boot falls back to live', async () => {
    const emptyFetch = (async () => okJson({ buildId: 'dev', cooks: [] })) as typeof fetch;
    const feed = await loadSnapshotFeed({ fetchFn: emptyFetch, cache: createRecipeCache({ dbName: `e-${Math.random()}` }), buildId: 'dev' });
    expect(feed).toBeNull();
  });

  // Phase 3 wiring (2026-08-06 sharding plan): the loader must use the BATCHED
  // write path — one putMany per shard — not one connection per record. A spy
  // cache proves the seam; retrievability proves the batch really landed.
  it('hydrates each shard with ONE putMany, never per-record put', async () => {
    const cache = createRecipeCache({ dbName: `batch-${Math.random()}` });
    let putCalls = 0;
    let putManyCalls = 0;
    const spy: typeof cache = {
      ...cache,
      put: async (r) => {
        putCalls += 1;
        return cache.put(r);
      },
      putMany: async (rs) => {
        putManyCalls += 1;
        return cache.putMany(rs);
      },
    };
    const feed = await loadSnapshotFeed({ fetchFn: bundleFetch(), cache: spy, buildId: 'dev' });
    expect(feed!.entries).toHaveLength(3);
    expect(putCalls).toBe(0);
    expect(putManyCalls).toBe(2); // one per cook shard
    expect(await cache.get(feed!.entries[0]!.uri)).toBeDefined();
  });

  it('reports each cook as it loads via onCookLoaded (progressive first paint)', async () => {
    const cache = createRecipeCache({ dbName: `prog-${Math.random()}` });
    const seen: [string, number][] = [];
    await loadSnapshotFeed({
      fetchFn: bundleFetch(),
      cache,
      buildId: 'dev',
      onCookLoaded: (cook, entries) => seen.push([cook.did, entries.length]),
    });
    expect(seen.sort()).toEqual([
      [DID_A, 2],
      [DID_B, 1],
    ]);
  });

  // Hydration fast path: a cook already hydrated for this build serves straight
  // from the recipe cache — its shard is neither fetched nor re-verified.
  it('serves an already-hydrated cook from IndexedDB without touching its shard', async () => {
    const dbName = `fast-${Math.random()}`;
    const storeDb = `fast-store-${Math.random()}`;
    const cache = createRecipeCache({ dbName });
    const store = createSnapshotStore({ buildId: 'dev', dbName: storeDb });
    // First boot: normal hydration, records the marker.
    const first = await loadSnapshotFeed({ fetchFn: bundleFetch(), cache, buildId: 'dev', store });
    expect(first!.entries).toHaveLength(3);
    // Second boot: shard requests now fail loudly — only index.json may load.
    const indexOnly = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/index.json')) return okJson(index);
      throw new Error(`unexpected shard fetch: ${url}`);
    }) as typeof fetch;
    const second = await loadSnapshotFeed({ fetchFn: indexOnly, cache, buildId: 'dev', store });
    expect(second).not.toBeNull();
    expect(second!.entries).toHaveLength(3);
    expect(second!.entries.map((e) => (e.value as { name?: string }).name).sort()).toEqual(['Apple', 'Bread', 'Cake']);
    // Cached entries keep their verification verdict.
    expect(second!.entries.every((e) => typeof e.verified === 'boolean')).toBe(true);
  });

  it('falls back to the shard when the hydration marker outruns the cache', async () => {
    const cache = createRecipeCache({ dbName: `stale-${Math.random()}` });
    const store = createSnapshotStore({ buildId: 'dev', dbName: `stale-store-${Math.random()}` });
    // A marker pointing at uris the cache does not hold (e.g. the recipe DB was
    // cleared independently of the snapshot DB).
    await store.setHydratedUris(DID_A, [rec(DID_A, 'a1', 'Apple').uri, rec(DID_A, 'a2', 'Bread').uri]);
    const feed = await loadSnapshotFeed({ fetchFn: bundleFetch(), cache, buildId: 'dev', store });
    expect(feed!.entries).toHaveLength(3); // shard fetch healed the gap
  });
});
