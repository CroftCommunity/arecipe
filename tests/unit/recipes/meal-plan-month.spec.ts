// Published-plans month calendar math (read-only view on the plans subpage).
// Pure + clock-free. Behaviors:
//  - monthOfDate / monthLabel / addMonths: strict YYYY-MM keys, year rollover,
//    null (never throw) on malformed input
//  - monthGrid: Monday-first flat cells padded to whole weeks with nulls
//  - mealsByDate: merges every DATED plan (skipping undated), stacks
//    overlapping plans on a day, honors week `repeat`, collapses exact
//    cross-plan duplicates (same date + category + recipe uri)
//  - defaultMonth: today's month when planned (or when nothing is), else the
//    nearest planned month (upcoming preferred) so the view never opens blank
import { describe, expect, it } from 'vitest';
import {
  addMonths,
  defaultMonth,
  mealsByDate,
  monthGrid,
  monthLabel,
  monthOfDate,
} from '../../../src/recipes/meal-plan-month.js';
import type { LocalMeal, LocalPlan, LocalWeek } from '../../../src/recipes/meal-plan-local.js';

const meal = (name: string, category?: string): LocalMeal => ({
  recipe: { uri: `at://did:plc:x/app.arecipe.recipe/${name}`, cid: 'cid1', name },
  ...(category !== undefined ? { category } : {}),
});

const emptyWeek = (repeat = 1): LocalWeek => ({
  repeat,
  days: Array.from({ length: 7 }, () => ({ meals: [] })),
});

const plan = (startDate: string | undefined, weeks: LocalWeek[], id = 'p1'): LocalPlan => ({
  id,
  name: 'My meal plan',
  weeks,
  mealsPerDay: 3,
  ...(startDate !== undefined ? { startDate } : {}),
  updatedAt: '2026-07-16T00:00:00.000Z',
});

describe('monthOfDate', () => {
  it('extracts the YYYY-MM key', () => {
    expect(monthOfDate('2026-07-20')).toBe('2026-07');
  });

  it('returns null for malformed or out-of-range input', () => {
    expect(monthOfDate('2026-7-20')).toBeNull();
    expect(monthOfDate('2026-13-01')).toBeNull();
    expect(monthOfDate('not-a-date')).toBeNull();
    expect(monthOfDate('')).toBeNull();
  });
});

describe('monthLabel', () => {
  it('formats a human month title', () => {
    expect(monthLabel('2026-07')).toBe('July 2026');
    expect(monthLabel('2026-01')).toBe('January 2026');
  });

  it('returns null for a malformed key', () => {
    expect(monthLabel('2026-00')).toBeNull();
    expect(monthLabel('July')).toBeNull();
  });
});

describe('addMonths', () => {
  it('steps within a year', () => {
    expect(addMonths('2026-07', 1)).toBe('2026-08');
    expect(addMonths('2026-07', -1)).toBe('2026-06');
  });

  it('rolls over year boundaries in both directions', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-07', 18)).toBe('2028-01');
  });

  it('returns null for a malformed key', () => {
    expect(addMonths('2026-7', 1)).toBeNull();
  });
});

describe('monthGrid', () => {
  it('lays July 2026 out Monday-first with pads to whole weeks', () => {
    const cells = monthGrid('2026-07');
    expect(cells).not.toBeNull();
    // Jul 1 2026 is a Wednesday → two leading pads (Mon, Tue).
    expect(cells?.slice(0, 3)).toEqual([null, null, '2026-07-01']);
    expect(cells?.length).toBe(35); // 2 + 31 + 2 = 5 whole weeks
    expect(cells?.[cells.length - 3]).toBe('2026-07-31');
    expect(cells?.[cells.length - 1]).toBeNull();
  });

  it('needs no leading pad when the month starts on a Monday', () => {
    // Jun 1 2026 is a Monday.
    const cells = monthGrid('2026-06');
    expect(cells?.[0]).toBe('2026-06-01');
    expect(cells?.length).toBe(35); // 30 days + 5 trailing pads
  });

  it('handles a leap February', () => {
    const cells = monthGrid('2028-02');
    expect(cells).toContain('2028-02-29');
  });

  it('returns null for a malformed key', () => {
    expect(monthGrid('2026-7')).toBeNull();
    expect(monthGrid('2026-13')).toBeNull();
  });
});

describe('mealsByDate', () => {
  it('maps a dated plan onto real dates', () => {
    const w = emptyWeek();
    w.days[0] = { meals: [meal('Pancakes', 'breakfast')] }; // Mon
    w.days[3] = { meals: [meal('Tacos', 'dinner')] }; // Thu
    const byDate = mealsByDate([plan('2026-07-20', [w])]);
    expect([...byDate.keys()].sort()).toEqual(['2026-07-20', '2026-07-23']);
    expect(byDate.get('2026-07-20')?.map((m) => m.recipe.name)).toEqual(['Pancakes']);
  });

  it('skips undated plans (no calendar position)', () => {
    const w = emptyWeek();
    w.days[0] = { meals: [meal('Pancakes')] };
    expect(mealsByDate([plan(undefined, [w])]).size).toBe(0);
  });

  it('stacks overlapping plans on the same day, in plan order', () => {
    const a = emptyWeek();
    a.days[0] = { meals: [meal('Pancakes', 'breakfast')] };
    const b = emptyWeek();
    b.days[0] = { meals: [meal('Salad', 'lunch')] };
    const byDate = mealsByDate([plan('2026-07-20', [a], 'p1'), plan('2026-07-20', [b], 'p2')]);
    expect(byDate.get('2026-07-20')?.map((m) => m.recipe.name)).toEqual(['Pancakes', 'Salad']);
  });

  it('collapses an exact duplicate (same date + category + uri) across plans', () => {
    const a = emptyWeek();
    a.days[0] = { meals: [meal('Pancakes', 'breakfast')] };
    const byDate = mealsByDate([plan('2026-07-20', [a], 'p1'), plan('2026-07-20', [a], 'p2')]);
    expect(byDate.get('2026-07-20')).toHaveLength(1);
  });

  it('keeps the same recipe on a day when the category differs', () => {
    const w = emptyWeek();
    w.days[0] = { meals: [meal('Eggs', 'breakfast'), meal('Eggs', 'dinner')] };
    expect(mealsByDate([plan('2026-07-20', [w])]).get('2026-07-20')).toHaveLength(2);
  });

  it('honors week repeat: a repeated week lands on later dates too', () => {
    const w = emptyWeek(2);
    w.days[0] = { meals: [meal('Pancakes')] };
    const byDate = mealsByDate([plan('2026-07-20', [w])]);
    expect([...byDate.keys()].sort()).toEqual(['2026-07-20', '2026-07-27']);
  });

  it('multi-week plans offset each week by 7 days', () => {
    const w1 = emptyWeek();
    w1.days[6] = { meals: [meal('Roast')] }; // Sun of week 1
    const w2 = emptyWeek();
    w2.days[0] = { meals: [meal('Soup')] }; // Mon of week 2
    const byDate = mealsByDate([plan('2026-07-20', [w1, w2])]);
    expect([...byDate.keys()].sort()).toEqual(['2026-07-26', '2026-07-27']);
  });

  it('an unparseable startDate contributes nothing (never throws)', () => {
    const w = emptyWeek();
    w.days[0] = { meals: [meal('Pancakes')] };
    expect(mealsByDate([plan('not-a-date', [w])]).size).toBe(0);
  });
});

describe('defaultMonth', () => {
  it("opens on today's month when it holds a planned day", () => {
    expect(defaultMonth('2026-07-16', ['2026-07-20'])).toBe('2026-07');
  });

  it("opens on today's month when nothing is planned", () => {
    expect(defaultMonth('2026-07-16', [])).toBe('2026-07');
  });

  it('jumps to the next upcoming planned month when this month is empty', () => {
    expect(defaultMonth('2026-07-16', ['2026-05-04', '2026-09-01'])).toBe('2026-09');
  });

  it('falls back to the most recent past planned month when nothing is upcoming', () => {
    expect(defaultMonth('2026-07-16', ['2026-03-02', '2026-05-04'])).toBe('2026-05');
  });

  it('ignores malformed planned dates', () => {
    expect(defaultMonth('2026-07-16', ['garbage'])).toBe('2026-07');
  });

  it('returns null only for a malformed today', () => {
    expect(defaultMonth('garbage', ['2026-07-20'])).toBeNull();
  });
});
