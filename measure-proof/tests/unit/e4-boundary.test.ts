import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/corpus/rng.ts';
import {
  LocalStore,
  serialiseFlush,
  validateWirePayload,
  type WirePayload,
} from '../../src/client/store.ts';

const COUNTER_NAMES = ['page_home', 'page_recipe', 'feat_share', 'nav_home__to__recipe'];

function randomLocalState(seed: number): LocalStore {
  const rng = new Rng(seed);
  const store = new LocalStore('sess-' + seed, 'dev-' + seed);
  const n = rng.int(5, 40);
  let clock = 1_700_000_000_000;
  for (let i = 0; i < n; i++) {
    clock += rng.int(50, 9000);
    // Page labels are local-only; use sentinels that are NOT substrings of any
    // counter name, so the "did it leak?" substring scan is meaningful.
    store.record(rng.pick(COUNTER_NAMES), { at: clock, page: 'geo_' + rng.pick(['north', 'south']) });
  }
  return store;
}

describe('E4 — wire payload schema', () => {
  it('the flush is an unordered name→int map plus a coarse period marker only', () => {
    const store = randomLocalState(1);
    const payload = serialiseFlush(store, '2026-07'); // month bucket
    const problems = validateWirePayload(payload, { periodGranularity: 'month' });
    expect(problems).toEqual([]);
    expect(Object.keys(payload).sort()).toEqual(['counts', 'period', 'v']);
    for (const v of Object.values(payload.counts)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('property: no ordering, no session id, no timestamp finer than the bucket (200 states)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const store = randomLocalState(seed);
      const payload = serialiseFlush(store, '2026-07');
      const wire = JSON.stringify(payload);
      // The local session/device identity must never appear on the wire.
      expect(wire).not.toContain('sess-' + seed);
      expect(wire).not.toContain('dev-' + seed);
      // No fine timestamp: every recorded `at` is a 13-digit ms value; none survive.
      for (const ev of store.snapshot().events) {
        expect(wire).not.toContain(String(ev.at));
      }
      // No page labels, no per-event array — only the coarse period marks time.
      expect(payload.period).toMatch(/^\d{4}-\d{2}$/);
      expect(wire).not.toContain('"events"');
    }
  });
});

describe('E4 — local-stays-local invariant', () => {
  it('local-stays-local', () => {
    const store = randomLocalState(7);
    const snap = store.snapshot();
    const payload = serialiseFlush(store, '2026-07');
    const wire = JSON.stringify(payload);
    // Every field that exists ONLY in the local rich view is absent from the wire.
    const localOnly = [snap.sessionId, snap.deviceId, String(snap.startedAt)];
    for (const ev of snap.events) {
      localOnly.push(String(ev.at), ev.page);
    }
    for (const secret of localOnly) {
      expect(wire).not.toContain(secret);
    }
  });
});

describe('E4 — round-trip impossibility (demonstrated, not asserted)', () => {
  it('two different ordered histories collapse to the same payload', () => {
    const a = new LocalStore('sess-A', 'dev-A');
    a.record('page_home', { at: 1_700_000_000_000, page: 'home' });
    a.record('page_recipe', { at: 1_700_000_002_000, page: 'recipe' });
    a.record('feat_share', { at: 1_700_000_004_000, page: 'recipe' });

    const b = new LocalStore('sess-B', 'dev-B');
    // Same counter multiset, DIFFERENT order and timestamps.
    b.record('feat_share', { at: 1_700_000_050_000, page: 'recipe' });
    b.record('page_recipe', { at: 1_700_000_051_000, page: 'recipe' });
    b.record('page_home', { at: 1_700_000_052_000, page: 'home' });

    const pa = serialiseFlush(a, '2026-07');
    const pb = serialiseFlush(b, '2026-07');
    // The rich local views are genuinely different journeys...
    expect(a.snapshot().events.map((e) => e.name)).not.toEqual(
      b.snapshot().events.map((e) => e.name),
    );
    // ...yet the wire payloads are identical. Order is unrecoverable from the wire.
    expect(pa).toEqual(pb);
  });

  it('rejects a payload that smuggles ordering or a fine timestamp', () => {
    const bad = {
      v: 1,
      period: '2026-07',
      counts: { page_home: 1 },
      order: ['page_home'], // smuggled ordering
    } as unknown as WirePayload;
    const problems = validateWirePayload(bad, { periodGranularity: 'month' });
    expect(problems.length).toBeGreaterThan(0);
  });
});
