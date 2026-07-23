// RUN-LAST-PLANNED Phase 1 (RED): the pure derivation. Counts and dates are
// COMPUTED from plan records on demand — nothing is stored, nothing is counted.
// buildPlannedIndex expands each week's `repeat`, keys by the slot's recipe
// AT-URI, and derives count / lastPlanned / nextPlanned against an injected
// `now`. Pure: no clock, no IO, no mutation of its input.
import { describe, expect, it } from 'vitest';
import { buildPlannedIndex } from '../../../src/recipes/planned-index.js';
import type { LocalMeal, LocalPlan, LocalWeek } from '../../../src/recipes/meal-plan-local.js';

const NOW = new Date('2026-07-23T12:00:00.000Z'); // nowIso = 2026-07-23

const meal = (uri: string): LocalMeal => ({ recipe: { uri, cid: `cid-${uri}`, name: uri } });

/** A week whose day cells are given by a sparse map dayIndex→meals. */
const week = (repeat: number, days: Record<number, LocalMeal[]>): LocalWeek => ({
  repeat,
  days: Array.from({ length: 7 }, (_u, i) => ({ meals: days[i] ?? [] })),
});

const plan = (over: Partial<LocalPlan> & { weeks: LocalWeek[] }): LocalPlan => ({
  id: 'p1',
  name: 'Plan',
  mealsPerDay: 3,
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

describe('buildPlannedIndex', () => {
  it('empty plans give an empty index', () => {
    expect(buildPlannedIndex([], NOW).size).toBe(0);
  });

  it('empty slots contribute nothing', () => {
    const p = plan({ weeks: [week(1, {})] });
    expect(buildPlannedIndex([p], NOW).size).toBe(0);
  });

  it('repeat: 4 on a block with two filled slots gives count 8', () => {
    // Both slots hold the same recipe: 2 slots × 4 repeats = 8 occurrences.
    const p = plan({ weeks: [week(4, { 0: [meal('at://x')], 1: [meal('at://x')] })] });
    const idx = buildPlannedIndex([p], NOW);
    expect(idx.get('at://x')?.count).toBe(8);
  });

  it('a recipe in two separate plan records sums across both', () => {
    const a = plan({ id: 'a', weeks: [week(2, { 0: [meal('at://x')] })] }); // 2
    const b = plan({ id: 'b', weeks: [week(3, { 0: [meal('at://x')] })] }); // 3
    expect(buildPlannedIndex([a, b], NOW).get('at://x')?.count).toBe(5);
  });

  it('lastPlanned is the latest occurrence at or before now, ignoring future ones', () => {
    // startDate Mon 2026-07-13; day0 with repeat 3 → Jul 13, Jul 20, Jul 27.
    const p = plan({ startDate: '2026-07-13', weeks: [week(3, { 0: [meal('at://x')] })] });
    const e = buildPlannedIndex([p], NOW).get('at://x');
    expect(e?.count).toBe(3);
    expect(e?.lastPlanned).toBe('2026-07-20'); // Jul 27 is in the future, ignored
  });

  it('nextPlanned is the earliest occurrence strictly after now', () => {
    const p = plan({ startDate: '2026-07-13', weeks: [week(3, { 0: [meal('at://x')] })] });
    expect(buildPlannedIndex([p], NOW).get('at://x')?.nextPlanned).toBe('2026-07-27');
  });

  it('a future-only recipe has lastPlanned null and a non-null nextPlanned', () => {
    const p = plan({ startDate: '2026-08-03', weeks: [week(1, { 0: [meal('at://future')] })] });
    const e = buildPlannedIndex([p], NOW).get('at://future');
    expect(e?.lastPlanned).toBeNull();
    expect(e?.nextPlanned).toBe('2026-08-03');
  });

  it('does not mutate its input', () => {
    const p = plan({ startDate: '2026-07-13', weeks: [week(2, { 0: [meal('at://x')] })] });
    const before = JSON.stringify(p);
    buildPlannedIndex([p], NOW);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('two calls with identical input give identical (deterministically ordered) output', () => {
    const plans = [
      plan({ id: 'b', weeks: [week(1, { 0: [meal('at://z')] })] }),
      plan({ id: 'a', weeks: [week(1, { 0: [meal('at://a')] })] }),
    ];
    const one = [...buildPlannedIndex(plans, NOW).entries()];
    const two = [...buildPlannedIndex(plans, NOW).entries()];
    expect(one).toEqual(two);
    expect(one.map(([uri]) => uri)).toEqual(['at://a', 'at://z']); // sorted by key
  });
});
