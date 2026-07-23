import { describe, expect, it } from 'vitest';
import {
  crossoverSites,
  DEFAULT_MODEL,
  flushesPerMonth,
  intervalsPerMonth,
  putsPerMonth,
  SECONDS_PER_MONTH,
} from '../../src/infra/put-math.ts';
import { ReceiverStore } from '../../src/infra/receiver.ts';

describe('E7 — Litestream PUT arithmetic', () => {
  it('reproduces the prior run: 1s sync on a continuously-written DB ≈ 2.6M PUT/month', () => {
    // The WAL-PUT ceiling at a given sync interval is intervals/month; at 1s that
    // is one PUT/second = 2,592,000/month — the prior box's ~2.6M finding.
    expect(intervalsPerMonth(1)).toBe(SECONDS_PER_MONTH);
    expect(intervalsPerMonth(1)).toBeGreaterThan(2_500_000);
    expect(intervalsPerMonth(1)).toBeLessThan(2_700_000);
  });

  it('the sync interval alone bounds WAL PUTs regardless of write volume', () => {
    // At 3s sync the ceiling is already under the 1M free tier, even saturated.
    expect(intervalsPerMonth(3)).toBeLessThan(1_000_000);
    // Saturating writes cannot exceed the interval ceiling.
    const saturated = putsPerMonth(10_000, 'per-session', 52_022, {
      ...DEFAULT_MODEL,
      syncIntervalSec: 3,
    });
    expect(saturated).toBeLessThan(intervalsPerMonth(3) + DEFAULT_MODEL.snapshotsPerMonth * DEFAULT_MODEL.putsPerSnapshot + 1);
  });

  it('flush cadence caps per-site writes', () => {
    expect(flushesPerMonth('per-session', 52_022)).toBe(52_022);
    expect(flushesPerMonth('hourly', 52_022)).toBe(720); // 24*30 ceiling
    expect(flushesPerMonth('daily', 52_022)).toBe(30);
  });

  it('states the crossovers: cadence sets it at 1s sync; a ≥3s interval removes it entirely', () => {
    // At a 1s sync the interval ceiling (2.59M) is over the 1M budget, so the
    // cadence decides the crossover site count.
    const perSession1s = crossoverSites('per-session', 52_022, {
      ...DEFAULT_MODEL,
      syncIntervalSec: 1,
    });
    expect(perSession1s).toBeGreaterThan(0);
    expect(perSession1s).toBeLessThan(100); // ~20 medium sites saturate the budget
    // Daily cadence pushes the crossover three orders of magnitude out.
    const daily1s = crossoverSites('daily', 52_022, { ...DEFAULT_MODEL, syncIntervalSec: 1 });
    expect(daily1s).toBeGreaterThan(10_000);
    // Raising the sync interval to ≥3s drops the ceiling under 1M → no crossover
    // for ANY cadence or site count.
    expect(crossoverSites('per-session', 52_022, { ...DEFAULT_MODEL, syncIntervalSec: 3 })).toBe(
      Infinity,
    );
  });

  it('putsPerMonth is monotone non-decreasing in site count', () => {
    let prev = 0;
    for (const n of [1, 10, 100, 1000]) {
      const p = putsPerMonth(n, 'per-session', 52_022, DEFAULT_MODEL);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe('E7 — destroy/restore drill (logical restore invariant)', () => {
  it('committed flushes survive a destroy+restore from the last replicated snapshot', () => {
    const store = new ReceiverStore();
    store.ingest({ v: 1, period: '2026-07', counts: { page_home: 3, feat_share: 1 } });
    store.ingest({ v: 1, period: '2026-07', counts: { page_home: 2 } });
    const snapshot = store.replicate(); // Litestream has pushed WAL up to here
    // A write lands AFTER the last replication — the at-risk window.
    store.ingest({ v: 1, period: '2026-07', counts: { page_recipe: 5 } });

    // Destroy the box, restore from the replicated snapshot.
    const restored = ReceiverStore.restore(snapshot);
    // Everything committed before replication survives exactly.
    expect(restored.total('2026-07', 'page_home')).toBe(5);
    expect(restored.total('2026-07', 'feat_share')).toBe(1);
    // The post-replication write is lost — bounded by the sync window, not silent.
    expect(restored.total('2026-07', 'page_recipe')).toBe(0);
  });
});
