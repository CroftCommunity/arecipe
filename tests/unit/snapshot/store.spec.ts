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

  it('getLatestDelta returns the newest stored delta, tracking the last putDelta', async () => {
    const store = createSnapshotStore({ buildId: 'b1', dbName: `s-${Math.random()}` });
    expect(await store.getLatestDelta(DID)).toBeNull();
    const r1 = [{ uri: 'at://x/y/1', cid: 'c1', value: { name: 'One' } }];
    await store.putDelta(DID, 'rev1', r1);
    expect(await store.getLatestDelta(DID)).toEqual({ rev: 'rev1', records: r1 });
    // A later refetch (new rev) becomes the latest; the older delta is still
    // directly addressable by its rev.
    const r2 = [{ uri: 'at://x/y/2', cid: 'c2', value: { name: 'Two' } }];
    await store.putDelta(DID, 'rev2', r2);
    expect(await store.getLatestDelta(DID)).toEqual({ rev: 'rev2', records: r2 });
    expect(await store.getDelta(DID, 'rev1')).toEqual(r1);
  });

  it('getLatestDelta is build-scoped', async () => {
    const dbName = `s-${Math.random()}`;
    const b1 = createSnapshotStore({ buildId: 'b1', dbName });
    const b2 = createSnapshotStore({ buildId: 'b2', dbName });
    await b1.putDelta(DID, 'rev1', [{ uri: 'u', cid: 'c', value: {} }]);
    expect(await b2.getLatestDelta(DID)).toBeNull();
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
