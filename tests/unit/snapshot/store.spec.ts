// D3/D5: the revalidation store. lastRevalidatedAt drives the cross-session
// debounce; deltas hold refetched records. Every key is build-scoped (buildId
// prefix) so a new build never mixes deltas across snapshot generations (D5).
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createSnapshotStore } from '../../../src/snapshot/store.js';

const DID = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';

describe('createSnapshotStore', () => {
  it('round-trips lastRevalidatedAt', async () => {
    const store = createSnapshotStore({ buildId: 'b1', dbName: `s-${Math.random()}` });
    expect(await store.getLastRevalidatedAt(DID)).toBeNull();
    await store.setLastRevalidatedAt(DID, 1_700_000);
    expect(await store.getLastRevalidatedAt(DID)).toBe(1_700_000);
  });

  it('round-trips a delta keyed by did + rev', async () => {
    const store = createSnapshotStore({ buildId: 'b1', dbName: `s-${Math.random()}` });
    const records = [{ uri: 'at://x/y/z', cid: 'c', value: { name: 'X' } }];
    await store.putDelta(DID, 'rev9', records);
    expect(await store.getDelta(DID, 'rev9')).toEqual(records);
    expect(await store.getDelta(DID, 'other')).toBeUndefined();
  });

  // Hydration marker (recipe-loading perf): once a cook's snapshot shard has
  // been verified into the recipe cache, later boots serve it straight from
  // IndexedDB — no shard fetch/parse, no CID recompute. The marker records
  // WHICH uris that hydration wrote, build-scoped like everything else here.
  it('round-trips the hydrated-uris marker, build-scoped', async () => {
    const dbName = `s-${Math.random()}`;
    const store = createSnapshotStore({ buildId: 'b1', dbName });
    expect(await store.getHydratedUris(DID)).toBeNull();
    await store.setHydratedUris(DID, ['at://a/r/1', 'at://a/r/2']);
    expect(await store.getHydratedUris(DID)).toEqual(['at://a/r/1', 'at://a/r/2']);
    // Another build starts cold — its snapshot files are different.
    const b2 = createSnapshotStore({ buildId: 'b2', dbName });
    expect(await b2.getHydratedUris(DID)).toBeNull();
  });

  it('scopes keys by buildId — a different build never sees the other build’s data', async () => {
    const dbName = `s-${Math.random()}`;
    const b1 = createSnapshotStore({ buildId: 'b1', dbName });
    const b2 = createSnapshotStore({ buildId: 'b2', dbName });
    await b1.setLastRevalidatedAt(DID, 111);
    await b1.putDelta(DID, 'rev1', [{ uri: 'u', cid: 'c', value: {} }]);
    expect(await b2.getLastRevalidatedAt(DID)).toBeNull();
    expect(await b2.getDelta(DID, 'rev1')).toBeUndefined();
    // b1 still has its own.
    expect(await b1.getLastRevalidatedAt(DID)).toBe(111);
  });
});
