// Phase 3: the pure meal-plan model — validation (open-world, fail-loud on
// required + the exactly-7-days structure), strongRef slot construction, and
// calendar expansion. Pure functions, so these unit tests are the isolated
// proof; entry-point wiring is proven by the mapped consumer phases (P6 for
// expandCalendar, P9 for validateMealPlanValue/slotWithRecipe) per the plan's
// export→wiring map.
import { describe, expect, it } from 'vitest';
import {
  MEAL_PLAN_COLLECTION,
  expandCalendar,
  slotWithRecipe,
  validateMealPlanValue,
  type PlanSlot,
  type PlanWeek,
} from '../../../src/recipes/meal-plan.js';

const days7 = (fill?: PlanSlot): PlanSlot[] => Array.from({ length: 7 }, () => fill ?? ({} as PlanSlot));

const validPlan = (): Record<string, unknown> => ({
  $type: MEAL_PLAN_COLLECTION,
  name: 'My week',
  weeks: [{ repeat: 1, days: days7() }],
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
});

describe('validateMealPlanValue', () => {
  it('accepts a valid plan and preserves unknown extra fields (open-world)', () => {
    const value = { ...validPlan(), somethingNew: 'keep me' };
    const out = validateMealPlanValue('at://x/app.arecipe.mealPlan/1', value);
    expect(out.name).toBe('My week');
    expect(out.weeks).toHaveLength(1);
    expect((out as Record<string, unknown>)['somethingNew']).toBe('keep me');
  });

  it('fails loud when required "weeks" is missing', () => {
    const { weeks, ...noWeeks } = validPlan();
    void weeks;
    expect(() => validateMealPlanValue('at://x/_/1', noWeeks)).toThrow(/weeks/);
  });

  it('fails loud when "name" is mistyped (not a string)', () => {
    expect(() => validateMealPlanValue('at://x/_/1', { ...validPlan(), name: 42 })).toThrow(/name/);
  });

  it('rejects a 6-day week (boundary below 7)', () => {
    const value = { ...validPlan(), weeks: [{ repeat: 1, days: days7().slice(0, 6) }] };
    expect(() => validateMealPlanValue('at://x/_/1', value)).toThrow(/7 days/);
  });

  it('rejects an 8-day week (boundary above 7)', () => {
    const value = { ...validPlan(), weeks: [{ repeat: 1, days: [...days7(), {}] }] };
    expect(() => validateMealPlanValue('at://x/_/1', value)).toThrow(/7 days/);
  });

  it('rejects a week that is not an object', () => {
    expect(() => validateMealPlanValue('at://x/_/1', { ...validPlan(), weeks: [null] })).toThrow(
      /7 days/,
    );
  });
});

describe('slotWithRecipe', () => {
  const ref = { uri: 'at://did:plc:abc/exchange.recipe.recipe/xyz', cid: 'bafyreiaaa' };

  it('builds a slot carrying the strongRef of the entry', () => {
    expect(slotWithRecipe(ref)).toEqual({ recipe: { uri: ref.uri, cid: ref.cid } });
  });

  it('carries a note when one is given', () => {
    expect(slotWithRecipe(ref, 'double batch')).toEqual({
      recipe: { uri: ref.uri, cid: ref.cid },
      note: 'double batch',
    });
  });
});

describe('expandCalendar', () => {
  it('stamps each week repeat times, top-to-bottom, in order', () => {
    const weeks: PlanWeek[] = [
      { repeat: 2, days: days7() },
      { repeat: 1, days: days7() },
    ];
    const cal = expandCalendar(weeks);
    expect(cal.map((c) => [c.week, c.rep])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
    // Every stamped row carries that week's 7 days.
    expect(cal.every((c) => c.days.length === 7)).toBe(true);
  });

  it('defaults a missing/undefined repeat to 1', () => {
    const cal = expandCalendar([{ days: days7() } as PlanWeek]);
    expect(cal).toHaveLength(1);
  });

  it('clamps repeat into [1,12] — 0→1, 13→12, 1 and 12 unchanged (boundaries)', () => {
    expect(expandCalendar([{ repeat: 0, days: days7() }])).toHaveLength(1);
    expect(expandCalendar([{ repeat: 1, days: days7() }])).toHaveLength(1);
    expect(expandCalendar([{ repeat: 12, days: days7() }])).toHaveLength(12);
    expect(expandCalendar([{ repeat: 13, days: days7() }])).toHaveLength(12);
  });
});
