// RUN-LAST-PLANNED Phase 1 (RED): the local cache. It is a CACHE, never
// authoritative — it stores a serialized index plus a fingerprint (the sorted
// content-identity of the source plans). On read, a caller whose known
// fingerprint disagrees with the stored one is told the cache is stale (absent),
// never handed stale data. An empty store reads as absent without throwing.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createPlannedIndexCache } from '../../../src/recipes/planned-index-local.js';
import type { PlannedEntry } from '../../../src/recipes/planned-index.js';

const idx = (): Map<string, PlannedEntry> =>
  new Map([
    ['at://x', { count: 3, lastPlanned: '2026-07-20', nextPlanned: '2026-07-27' }],
    ['at://y', { count: 1, lastPlanned: null, nextPlanned: '2026-08-01' }],
  ]);

describe('createPlannedIndexCache', () => {
  it('round-trips: write then read returns the same index', async () => {
    const cache = createPlannedIndexCache({ dbName: `pi-1-${Math.random()}` });
    await cache.write(idx(), ['p1@t1']);
    const read = await cache.read();
    expect(read).not.toBeUndefined();
    expect([...read!.entries()]).toEqual([...idx().entries()]);
  });

  it('a fingerprint mismatch reports stale (absent), not stale data', async () => {
    const cache = createPlannedIndexCache({ dbName: `pi-2-${Math.random()}` });
    await cache.write(idx(), ['p1@t1']);
    expect(await cache.read({ fingerprint: ['p1@t2'] })).toBeUndefined();
    // A matching fingerprint still reads through.
    expect(await cache.read({ fingerprint: ['p1@t1'] })).not.toBeUndefined();
  });

  it('an absent cache reads as absent without throwing', async () => {
    const cache = createPlannedIndexCache({ dbName: `pi-3-${Math.random()}` });
    expect(await cache.read()).toBeUndefined();
    expect(await cache.read({ fingerprint: ['anything'] })).toBeUndefined();
  });
});
