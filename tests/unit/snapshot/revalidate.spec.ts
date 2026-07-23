// D3: revalidation by repo revision. The headline: an unchanged repo costs ONE
// getLatestCommit and ZERO record fetches. These pin that, plus one-refetch on
// change, concurrency cap 4, cross-session debounce (+ force bypass), and
// error-tolerance (a failed rev check keeps the snapshot, never throws). D4's
// gone-repo removal is here too since it rides the same rev check.
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { revalidateCooks, type RevalidateCook } from '../../../src/snapshot/revalidate.js';
import { createSnapshotStore } from '../../../src/snapshot/store.js';

const cook = (n: number, rev = 'rev'): RevalidateCook => ({
  did: `did:plc:${String(n).padStart(24, '0')}`,
  handle: `cook${n}.example.com`,
  pds: `https://pds${n}.test`,
  rev,
});

/** Fake transport. getLatestCommit returns `liveRev(did)`; tracks call counts
 * and max concurrency. */
const transport = (opts: {
  liveRev: (did: string) => string;
  status?: (did: string) => number; // non-200 for gone/error simulation
  delayMs?: number;
}) => {
  const state = { commitCalls: 0, inFlight: 0, maxInFlight: 0 };
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const did = decodeURIComponent(new URL(url).searchParams.get('did') ?? '');
    state.commitCalls += 1;
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    state.inFlight -= 1;
    const status = opts.status?.(did) ?? 200;
    if (status !== 200) return { ok: false, status, json: async () => ({}) } as unknown as Response;
    return { ok: true, status: 200, json: async () => ({ rev: opts.liveRev(did), cid: 'c' }) } as unknown as Response;
  }) as typeof fetch;
  return { fetchFn, state };
};

const newStore = () => createSnapshotStore({ buildId: 'b', dbName: `rv-${Math.random()}` });

describe('revalidateCooks', () => {
  it('unchanged rev: exactly one request per cook and zero record fetches', async () => {
    const cooks = [cook(1), cook(2), cook(3)];
    const { fetchFn, state } = transport({ liveRev: () => 'rev' }); // matches manifest rev
    const readRecords = vi.fn(async () => []);
    const out = await revalidateCooks(cooks, { fetchFn, store: newStore(), readRecords, debounceMs: 0 });
    expect(state.commitCalls).toBe(3);
    expect(readRecords).toHaveBeenCalledTimes(0);
    expect(out.every((o) => o.status === 'unchanged')).toBe(true);
  });

  it('one changed rev out of twenty triggers exactly one refetch', async () => {
    const cooks = Array.from({ length: 20 }, (_, i) => cook(i));
    const changed = cooks[7]!.did;
    const { fetchFn } = transport({ liveRev: (did) => (did === changed ? 'MOVED' : 'rev') });
    const readRecords = vi.fn(async () => [{ uri: `at://${changed}/exchange.recipe.recipe/x`, cid: 'c', value: { name: 'New' } }]);
    const out = await revalidateCooks(cooks, { fetchFn, store: newStore(), readRecords, debounceMs: 0 });
    expect(readRecords).toHaveBeenCalledTimes(1);
    expect(out.filter((o) => o.status === 'changed').map((o) => o.did)).toEqual([changed]);
  });

  it('never exceeds concurrency 4, proven by instrumenting the transport', async () => {
    const cooks = Array.from({ length: 20 }, (_, i) => cook(i));
    const { fetchFn, state } = transport({ liveRev: () => 'rev', delayMs: 5 });
    await revalidateCooks(cooks, { fetchFn, store: newStore(), readRecords: async () => [], debounceMs: 0, concurrency: 4 });
    expect(state.maxInFlight).toBeLessThanOrEqual(4);
    expect(state.maxInFlight).toBeGreaterThan(1); // actually parallel, not serial
  });

  it('debounce: skips within the window, fires outside it; force always bypasses', async () => {
    const store = newStore();
    const c = cook(1);
    await store.setLastRevalidatedAt(c.did, 1_000_000);
    const within = transport({ liveRev: () => 'rev' });
    const r1 = await revalidateCooks([c], { fetchFn: within.fetchFn, store, readRecords: async () => [], debounceMs: 60_000, now: () => 1_030_000 });
    expect(within.state.commitCalls).toBe(0); // 30s < 60s window → skipped
    expect(r1[0]!.status).toBe('debounced');

    const outside = transport({ liveRev: () => 'rev' });
    await revalidateCooks([c], { fetchFn: outside.fetchFn, store, readRecords: async () => [], debounceMs: 60_000, now: () => 1_090_000 });
    expect(outside.state.commitCalls).toBe(1); // 90s > 60s window → fires

    // force bypasses even a fresh timestamp.
    await store.setLastRevalidatedAt(c.did, 2_000_000);
    const forced = transport({ liveRev: () => 'rev' });
    await revalidateCooks([c], { fetchFn: forced.fetchFn, store, readRecords: async () => [], debounceMs: 60_000, now: () => 2_001_000, force: true });
    expect(forced.state.commitCalls).toBe(1);
  });

  it('a rev check that rejects leaves the snapshot rendered (no throw, no refetch)', async () => {
    const { fetchFn } = transport({ liveRev: () => 'rev' });
    const throwing = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    void fetchFn;
    const readRecords = vi.fn(async () => []);
    const out = await revalidateCooks([cook(1)], { fetchFn: throwing, store: newStore(), readRecords, debounceMs: 0 });
    expect(out[0]!.status).toBe('error');
    expect(readRecords).toHaveBeenCalledTimes(0);
  });

  it('a deactivated/gone repo (400) is reported gone and calls onGone (D4)', async () => {
    const gone = cook(1).did;
    const { fetchFn } = transport({ liveRev: () => 'rev', status: (did) => (did === gone ? 400 : 200) });
    const onGone = vi.fn();
    const out = await revalidateCooks([cook(1)], { fetchFn, store: newStore(), readRecords: async () => [], debounceMs: 0, onGone });
    expect(out[0]!.status).toBe('gone');
    expect(onGone).toHaveBeenCalledWith(gone);
  });

  it('D4: a handle change is applied (live wins) when the repo changed', async () => {
    const c = cook(1, 'rev'); // manifest handle is cook1.example.com
    const { fetchFn } = transport({ liveRev: () => 'MOVED' }); // changed → identity re-resolved
    const resolveIdentity = vi.fn(async () => ({ handle: 'renamed.example.com', displayName: 'Renamed' }));
    const onIdentity = vi.fn();
    await revalidateCooks([c], {
      fetchFn,
      store: newStore(),
      readRecords: async () => [],
      debounceMs: 0,
      resolveIdentity,
      onIdentity,
    });
    expect(onIdentity).toHaveBeenCalledWith(c.did, { handle: 'renamed.example.com', displayName: 'Renamed' });
  });

  it('D4: identity is NOT re-resolved on the routine unchanged warm path (one request per cook)', async () => {
    const c = cook(1, 'rev');
    const { fetchFn, state } = transport({ liveRev: () => 'rev' }); // unchanged
    const resolveIdentity = vi.fn(async () => ({ handle: 'x' }));
    await revalidateCooks([c], { fetchFn, store: newStore(), readRecords: async () => [], debounceMs: 0, resolveIdentity });
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(state.commitCalls).toBe(1); // still exactly one request
  });

  it('D4: a forced refresh re-resolves identity even when the repo is unchanged', async () => {
    const c = cook(1, 'rev');
    const { fetchFn } = transport({ liveRev: () => 'rev' });
    const resolveIdentity = vi.fn(async () => ({ handle: 'same' }));
    const onIdentity = vi.fn();
    await revalidateCooks([{ ...c, handle: 'same' }], {
      fetchFn,
      store: newStore(),
      readRecords: async () => [],
      debounceMs: 0,
      force: true,
      resolveIdentity,
      onIdentity,
    });
    expect(resolveIdentity).toHaveBeenCalledOnce();
    expect(onIdentity).not.toHaveBeenCalled(); // handle unchanged → no update, but it DID check
  });

  it('a changed repo calls onChanged with the refetched records (D4 live-wins)', async () => {
    const c = cook(1);
    const { fetchFn } = transport({ liveRev: () => 'MOVED' });
    const records = [{ uri: `at://${c.did}/exchange.recipe.recipe/x`, cid: 'c', value: { name: 'Fresh' } }];
    const onChanged = vi.fn();
    const store = newStore();
    await revalidateCooks([c], { fetchFn, store, readRecords: async () => records, debounceMs: 0, onChanged });
    expect(onChanged).toHaveBeenCalledWith(c.did, records);
    // delta persisted under the new rev.
    expect(await store.getDelta(c.did, 'MOVED')).toEqual(records);
  });
});
