// Phase 1 (ICS feed): the shared, pure date-derivation both the planner and the
// .ics feed consume — so their dates cannot drift. These characterization tests
// pin the exact dates src/pages/meals.ts renders today: the date base is the
// RUNNING position in the expanded calendar (a repeat stamps consecutive weeks),
// never the source week index.
import { describe, expect, it } from 'vitest';
import { deriveDatedRows, deriveDatedSlots } from '../../../src/recipes/meal-plan-calendar.js';

type Slot = { recipe?: { uri: string; cid: string; name: string }; note?: string };
const days7 = (): Slot[] => Array.from({ length: 7 }, () => ({}));
const week = (repeat: number, days: Slot[] = days7()): { repeat: number; days: Slot[] } => ({
  repeat,
  days,
});

describe('deriveDatedRows', () => {
  it('single-week plan (repeat 1) yields 7 consecutive dated days from the anchor', () => {
    const [row, ...rest] = deriveDatedRows([week(1)], '2026-07-13');
    expect(rest).toHaveLength(0);
    expect(row?.rowIndex).toBe(0);
    expect(row?.weekIndex).toBe(1);
    expect(row?.occurrenceIndex).toBe(1);
    expect(row?.days.map((d) => d.date)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ]);
  });

  it('repeat = N yields N consecutive weeks of the same pattern (running offset)', () => {
    const rows = deriveDatedRows([week(3)], '2026-07-13');
    expect(rows.map((r) => [r.rowIndex, r.weekIndex, r.occurrenceIndex])).toEqual([
      [0, 1, 1],
      [1, 1, 2],
      [2, 1, 3],
    ]);
    // Each occurrence starts a NEW calendar week (Mon), 7 days apart — NOT the
    // same source-week date repeated.
    expect(rows.map((r) => r.days[0]?.date)).toEqual(['2026-07-13', '2026-07-20', '2026-07-27']);
  });

  it('multi-week plans sequence correctly across a month boundary', () => {
    // Week 1 (repeat 1) then Week 2 (repeat 1): rows at offset 0 and 7 days.
    const rows = deriveDatedRows([week(1), week(1)], '2026-07-27');
    expect(rows.map((r) => r.days[0]?.date)).toEqual(['2026-07-27', '2026-08-03']);
    // Last day of the second week rolls into August.
    expect(rows[1]?.days[6]?.date).toBe('2026-08-09');
  });

  it('a repeat>1 week followed by another week keeps a single running offset', () => {
    // W1 repeat 2 (rows 0,1) then W2 repeat 1 (row 2) — W2 lands 2 weeks out.
    const rows = deriveDatedRows([week(2), week(1)], '2026-07-13');
    expect(rows.map((r) => [r.weekIndex, r.occurrenceIndex, r.days[0]?.date])).toEqual([
      [1, 1, '2026-07-13'],
      [1, 2, '2026-07-20'],
      [2, 1, '2026-07-27'],
    ]);
  });

  it('no startDate anchor → every date is null (abstract-label mode)', () => {
    const rows = deriveDatedRows([week(2)], undefined);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.days.every((d) => d.date === null))).toBe(true);
    // Structural coordinates are still present so the app can label "Week N".
    expect(rows.map((r) => [r.weekIndex, r.occurrenceIndex])).toEqual([
      [1, 1],
      [1, 2],
    ]);
  });

  it('carries the original slot through (cached name survives) and clamps repeat', () => {
    const filled: Slot[] = [
      { recipe: { uri: 'at://d/c/r', cid: 'bafy', name: 'Lasagna' } },
      ...days7().slice(1),
    ];
    const rows = deriveDatedRows([{ repeat: 13, days: filled }], '2026-07-13');
    expect(rows).toHaveLength(12); // clamped to [1,12] via expandCalendar
    expect(rows[0]?.days[0]?.slot.recipe?.name).toBe('Lasagna');
  });

  it('invalid anchor yields null dates rather than throwing', () => {
    const rows = deriveDatedRows([week(1)], 'not-a-date');
    expect(rows[0]?.days.every((d) => d.date === null)).toBe(true);
  });
});

describe('deriveDatedSlots (flat view)', () => {
  it('flattens every dated day-slot in calendar order with coordinates', () => {
    const slots = deriveDatedSlots([week(2)], '2026-07-13');
    expect(slots).toHaveLength(14);
    expect(slots[0]).toMatchObject({ rowIndex: 0, weekIndex: 1, occurrenceIndex: 1, dayIndex: 0, date: '2026-07-13' });
    expect(slots[7]).toMatchObject({ rowIndex: 1, weekIndex: 1, occurrenceIndex: 2, dayIndex: 0, date: '2026-07-20' });
    expect(slots[13]).toMatchObject({ dayIndex: 6, date: '2026-07-26' });
  });
});
