// Meal-plan date math (publish + share): a plan anchors on the first Monday's
// date, and every slot lays out from there. Pure, floating (date-only, no TZ
// conversion) so a shared calendar reads the same in every timezone. Behaviors:
//  - addDays counts calendar days across month/year boundaries
//  - dateForSlot maps (weekIndex, dayIndex) → date, 7 days per week
//  - invalid anchors degrade to null (never throw, never render garbage)
//  - formatShortDate gives a stable, locale-independent label
import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateForSlot,
  formatShortDate,
  weekRangeLabel,
} from '../../../src/recipes/meal-plan-dates.js';

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-07-13', 3)).toBe('2026-07-16');
  });

  it('rolls over a month boundary', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02');
  });

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-30', 4)).toBe('2027-01-03');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('returns null for an unparseable anchor', () => {
    expect(addDays('not-a-date', 1)).toBeNull();
    expect(addDays('', 1)).toBeNull();
  });
});

describe('dateForSlot', () => {
  it('counts 7 days per week from the anchor (first Monday)', () => {
    // Week 0 Mon = anchor; Week 0 Sun (day 6) = +6; Week 1 Mon (day 0) = +7.
    expect(dateForSlot('2026-07-13', 0, 0)).toBe('2026-07-13');
    expect(dateForSlot('2026-07-13', 0, 6)).toBe('2026-07-19');
    expect(dateForSlot('2026-07-13', 1, 0)).toBe('2026-07-20');
    expect(dateForSlot('2026-07-13', 2, 3)).toBe('2026-07-30');
  });

  it('returns null for an invalid anchor', () => {
    expect(dateForSlot('nope', 1, 1)).toBeNull();
  });
});

describe('weekRangeLabel', () => {
  it('gives a real date range when anchored (first day → last day)', () => {
    // 2 weeks from Mon Jul 13 → last day is +13 days = Jul 26.
    expect(weekRangeLabel('2026-07-13', 2)).toBe('Jul 13 – Jul 26');
    expect(weekRangeLabel('2026-07-13', 1)).toBe('Jul 13 – Jul 19');
  });

  it('falls back to a week count with no anchor', () => {
    expect(weekRangeLabel(undefined, 3)).toBe('3 weeks');
    expect(weekRangeLabel(undefined, 1)).toBe('1 week');
  });

  it('falls back to the week count when the anchor is invalid', () => {
    expect(weekRangeLabel('nope', 2)).toBe('2 weeks');
  });
});

describe('formatShortDate', () => {
  it('formats an ISO date as a stable "Mon DD" label (locale-independent)', () => {
    expect(formatShortDate('2026-07-13')).toBe('Jul 13');
    expect(formatShortDate('2026-01-05')).toBe('Jan 5');
    expect(formatShortDate('2026-12-31')).toBe('Dec 31');
  });

  it('returns null for an invalid date', () => {
    expect(formatShortDate('nope')).toBeNull();
  });
});
