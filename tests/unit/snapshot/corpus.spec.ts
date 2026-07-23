// D6: the Wikibooks corpus as first tenant — one DID, one rev, thousands of
// records changing ~twice a year. It must (a) revalidate in exactly ONE request
// like any cook, and (b) shard so first paint never loads the whole thing: the
// index carries only titles + rkeys, the eager feed skips the corpus, and
// opening one recipe fetches exactly one shard. Drives the real generator
// (snapshotCook with maxRecordsPerShard) into the real loader.
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { snapshotCook } from '../../../scripts/lib/snapshot-core.mjs';
import { loadSnapshotFeed, loadRecipeShard } from '../../../src/snapshot/load.js';
import { revalidateCooks } from '../../../src/snapshot/revalidate.js';
import { createSnapshotStore } from '../../../src/snapshot/store.js';
import { createRecipeCache } from '../../../src/recipes/cache.js';
import type { SnapshotIndex } from '../../../src/snapshot/types.js';

const CORPUS = 'did:plc:corpuscorpuscorpuscorpus';
const N = 5; // stand-in for "thousands"; sharded 2 per file → 3 shards

const record = (rkey: string, name: string) => ({
  uri: `at://${CORPUS}/exchange.recipe.recipe/${rkey}`,
  cid: `bafyrei${rkey}`,
  value: { name, text: 't', ingredients: ['i'], instructions: ['s'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
});
const RECORDS = Array.from({ length: N }, (_, i) => record(`r${i}`, `Recipe ${i}`));

// A fake PDS serving getLatestCommit + one page of listRecords.
const pdsFetch = (rev: string) =>
  (async (url: string) => {
    if (String(url).includes('getLatestCommit')) return { ok: true, status: 200, json: async () => ({ rev, cid: `commit-${rev}` }) };
    return { ok: true, status: 200, json: async () => ({ records: RECORDS, cursor: undefined }) };
  }) as unknown as typeof fetch;

const buildCorpusSnapshot = async () => {
  const out = await snapshotCook({
    fetchImpl: pdsFetch('corpusrev') as never,
    resolveImpl: async () => ({ pds: 'https://corpus.test' }),
    cook: { did: CORPUS, handle: 'wikibooks.corpus', displayName: 'Wikibooks Cookbook' },
    collection: 'exchange.recipe.recipe',
    capturedAt: '2026-07-23T00:00:00Z',
    maxRecordsPerShard: 2,
  });
  if (!out.ok) throw new Error('corpus snapshot failed');
  return out;
};

describe('D6 corpus generator sharding', () => {
  it('splits the corpus into fixed-size shards and tags each index recipe with its shard', async () => {
    const out = await buildCorpusSnapshot();
    expect(out.shards.length).toBe(3); // ceil(5/2)
    expect(out.shards.map((s) => s.file)).toEqual([`cooks/${CORPUS}.0.json`, `cooks/${CORPUS}.1.json`, `cooks/${CORPUS}.2.json`]);
    // index stays minimal: titles + rkeys + which shard, no bodies.
    expect(out.indexCook.recipes).toHaveLength(5);
    expect(out.indexCook.recipes.every((r) => typeof r.shard === 'string')).toBe(true);
    expect(JSON.stringify(out.indexCook)).not.toContain('ingredients');
  });
});

describe('D6 corpus lazy loading', () => {
  const serveSnapshot = async () => {
    const out = await buildCorpusSnapshot();
    const index: SnapshotIndex = { buildId: 'dev', cooks: [out.indexCook] };
    const shardByFile = new Map(out.shards.map((s) => [`./assets/snapshot/dev/${s.file}`, s.shard]));
    const calls = { shard: 0 };
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/index.json')) return { ok: true, status: 200, json: async () => index } as unknown as Response;
      const shard = shardByFile.get(url);
      if (shard !== undefined) {
        calls.shard += 1;
        return { ok: true, status: 200, json: async () => shard } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }) as typeof fetch;
    return { index, fetchFn, calls };
  };

  it('does NOT eager-load the corpus into the feed (first paint never loads it whole)', async () => {
    const { fetchFn, calls } = await serveSnapshot();
    const feed = await loadSnapshotFeed({ fetchFn, cache: createRecipeCache({ dbName: `c-${Math.random()}` }), buildId: 'dev' });
    expect(feed).not.toBeNull();
    expect(feed!.entries).toHaveLength(0); // corpus is lazy, not eager
    expect(calls.shard).toBe(0); // zero shard fetches on first paint
  });

  it('opening one recipe from the index fetches exactly one shard', async () => {
    const { index, fetchFn, calls } = await serveSnapshot();
    // r3 lives in shard 1 (records 2,3). Loading it fetches only that shard.
    const shard = await loadRecipeShard({ fetchFn, index, did: CORPUS, rkey: 'r3', buildId: 'dev' });
    expect(calls.shard).toBe(1);
    expect(shard?.records.map((r) => r.uri.split('/').pop())).toContain('r3');
  });
});

describe('D6 corpus revalidation', () => {
  it('revalidates the whole corpus in exactly one request when unchanged', async () => {
    const commit = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ rev: 'corpusrev', cid: 'c' }) }));
    const fetchFn = commit as unknown as typeof fetch;
    const readRecords = vi.fn(async () => RECORDS);
    const out = await revalidateCooks(
      [{ did: CORPUS, handle: 'wikibooks.corpus', pds: 'https://corpus.test', rev: 'corpusrev' }],
      { fetchFn, store: createSnapshotStore({ buildId: 'dev', dbName: `cr-${Math.random()}` }), readRecords, debounceMs: 0 },
    );
    expect(commit).toHaveBeenCalledTimes(1); // one getLatestCommit for thousands of records
    expect(readRecords).toHaveBeenCalledTimes(0); // unchanged → no shard/record fetch
    expect(out[0]!.status).toBe('unchanged');
  });
});
