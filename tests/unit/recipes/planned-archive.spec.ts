// RUN-LAST-PLANNED Phase 1 (RED): archive partition + stats. A meal-plan range
// whose derived dates have entirely passed is ARCHIVED (a view, not a deletion);
// a range still touching or ahead of `now` stays active. Stats are derived from
// the same planned index — no stored aggregate.
import { describe, expect, it } from 'vitest';
import { partitionPlans, partitionRanges, plannedStats } from '../../../src/recipes/planned-archive.js';
import type { PlannedEntry } from '../../../src/recipes/planned-index.js';
import type { LocalPlan, LocalWeek } from '../../../src/recipes/meal-plan-local.js';

const NOW = new Date('2026-07-23T12:00:00.000Z'); // nowIso = 2026-07-23

const week = (): LocalWeek => ({ repeat: 1, days: Array.from({ length: 7 }, () => ({ meals: [] })) });
const plan = (id: string, startDate: string | undefined): LocalPlan => ({
  id,
  name: id,
  weeks: [week()],
  mealsPerDay: 3,
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...(startDate !== undefined ? { startDate } : {}),
});

describe('partitionRanges', () => {
  it('archives a range ended yesterday; keeps one ending tomorrow; a range spanning now stays active', () => {
    const yesterday = { id: 'past', start: '2026-07-10', end: '2026-07-22' };
    const tomorrow = { id: 'future', start: '2026-07-24', end: '2026-07-30' };
    const spanning = { id: 'now', start: '2026-07-20', end: '2026-07-24' };
    const { active, archived } = partitionRanges([yesterday, tomorrow, spanning], NOW);
    expect(archived.map((r) => r.id)).toEqual(['past']);
    expect(active.map((r) => r.id).sort()).toEqual(['future', 'now']);
  });
});

describe('partitionPlans', () => {
  it('archives a fully-past plan, keeps a current one, and never archives an undated plan', () => {
    // A 1-week plan spans startDate..startDate+6. Past: 2026-07-06..07-12 (all
    // before now). Current: 2026-07-20..07-26 (spans now). Undated: no dates.
    const past = plan('past', '2026-07-06');
    const current = plan('current', '2026-07-20');
    const undated = plan('undated', undefined);
    const { active, archived } = partitionPlans([past, current, undated], NOW);
    expect(archived.map((p) => p.id)).toEqual(['past']);
    expect(active.map((p) => p.id).sort()).toEqual(['current', 'undated']);
  });
});

describe('plannedStats', () => {
  it('derives totals, distinct count, most-common, and the date span from the index', () => {
    const index = new Map<string, PlannedEntry>([
      ['at://a', { count: 5, lastPlanned: '2026-07-20', nextPlanned: '2026-07-27' }],
      ['at://b', { count: 2, lastPlanned: '2026-06-01', nextPlanned: null }],
      ['at://c', { count: 3, lastPlanned: null, nextPlanned: '2026-09-15' }],
    ]);
    const stats = plannedStats(index);
    expect(stats.totalPlanned).toBe(10); // 5 + 2 + 3
    expect(stats.distinctRecipes).toBe(3);
    expect(stats.mostCommon).toEqual({ uri: 'at://a', count: 5 });
    expect(stats.span).toEqual({ first: '2026-06-01', last: '2026-09-15' });
  });

  it('an empty index yields zeroed stats and a null most-common / span', () => {
    const stats = plannedStats(new Map());
    expect(stats).toEqual({ totalPlanned: 0, distinctRecipes: 0, mostCommon: null, span: null });
  });
});
