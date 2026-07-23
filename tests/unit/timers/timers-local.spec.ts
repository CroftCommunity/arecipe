// Feature A (timers) — device-scoped persistence. Timers survive navigation
// and reload because they live in IndexedDB (never the PDS — a timer is not a
// record). What must round-trip exactly is `endsAt`: an expired timer must read
// back as still-expired, not as a fresh countdown.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createTimer, isExpired } from '../../../src/timers/timer-state.js';
import { createTimerStore } from '../../../src/timers/timers-local.js';

describe('createTimerStore', () => {
  it('round-trips a timer, preserving endsAt exactly', async () => {
    const store = createTimerStore({ dbName: `t1-${Math.random()}` });
    const t = createTimer({ label: 'rice', durationMs: 600_000, now: 1_234_567 });
    await store.save(t);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.endsAt).toBe(t.endsAt);
    expect(list[0]?.id).toBe(t.id);
    expect(list[0]?.durationMs).toBe(600_000);
  });

  it('an expired timer reads back as expired, not as a fresh timer', async () => {
    const store = createTimerStore({ dbName: `t2-${Math.random()}` });
    // Created far in the past: its endsAt is already behind "now".
    const past = createTimer({ label: 'stale', durationMs: 60_000, now: 10_000 });
    await store.save(past);
    const readBack = (await store.list())[0];
    expect(readBack).toBeDefined();
    // Read "now" is long after endsAt — the stored absolute endsAt makes this
    // expired, with no reset of the remaining time on read.
    expect(isExpired(readBack!, 10_000_000)).toBe(true);
    expect(readBack!.endsAt).toBe(past.endsAt);
  });

  it('remove deletes a timer', async () => {
    const store = createTimerStore({ dbName: `t3-${Math.random()}` });
    const t = createTimer({ label: 'x', durationMs: 1000, now: 1 });
    await store.save(t);
    await store.remove(t.id);
    expect(await store.list()).toHaveLength(0);
  });
});
