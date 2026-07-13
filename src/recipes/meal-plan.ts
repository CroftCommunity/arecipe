// Meal-plan model (Phase 3): the pure core of the planner — types, open-world
// validation, strongRef slot construction, and calendar expansion. No DOM, no
// network, no storage: this module is the behavior spec the page (Phases 5/6),
// the local store (Phase 4), and PDS sync (Phase 9) build on.
//
// Boundary validation follows atproto's open-world model (mirrors read.ts):
// unknown extra fields are tolerated and preserved; missing or mistyped
// REQUIRED fields fail loud. The structural invariant is exactly 7 day slots
// per week.

import { strongRefOf, type StrongRef } from './refs.js';

export const MEAL_PLAN_COLLECTION = 'app.arecipe.mealPlan';

/** Lowest and highest times a week may stamp onto the calendar. */
const REPEAT_MIN = 1;
const REPEAT_MAX = 12;

/** Bounds for a plan's "meals per day" cap (how many recipes a day may hold). */
export const MEALS_PER_DAY_MIN = 1;
export const MEALS_PER_DAY_MAX = 6;
export const MEALS_PER_DAY_DEFAULT = 3;

/** One placed meal on a day: a recipe (as a strongRef) and an optional note.
 * The meal-type LABEL is not stored here — it is derived from the recipe's own
 * category at render time (and cached alongside the ref in the buffer/record for
 * offline/cross-device display), so a day never carries a type the recipe
 * doesn't. */
export type PlanMeal = {
  recipe: StrongRef;
  note?: string;
};

/** A single day cell. The forward shape is a list of meals; `recipe`/`note`
 * remain readable for records written before multi-meal (see `mealsOfSlot`). */
export type PlanSlot = {
  meals?: PlanMeal[];
  /** @deprecated legacy single-recipe slot — migrate via `mealsOfSlot`. */
  recipe?: StrongRef;
  /** @deprecated legacy single-slot note — migrate via `mealsOfSlot`. */
  note?: string;
};

/** A week: how many times it stamps onto the calendar, and its 7 day slots. */
export type PlanWeek = {
  repeat: number;
  days: PlanSlot[];
};

export type MealPlanValue = {
  name: string;
  weeks: PlanWeek[];
  createdAt: string;
  updatedAt: string;
  startDate?: string;
  /** How many recipes a day may hold in the editor (1–6). Absent on records
   * written before multi-meal — callers default it. */
  mealsPerDay?: number;
  langs?: string[];
  text?: string;
  /** Open-world: everything else the record carries is preserved. */
  [key: string]: unknown;
};

/** One stamped row of the expanded calendar (a pure view of the weeks). */
export type CalendarWeek = {
  /** 1-based index of the source week this row came from. */
  week: number;
  /** 1-based occurrence within that week's repeat count. */
  rep: number;
  days: PlanSlot[];
};

const REQUIRED_STRING_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;

/** Validate a record value as an app.arecipe.mealPlan. Fail loud on missing or
 * mistyped required fields and on any week that is not exactly 7 days; tolerate
 * and preserve unknown extras. */
export const validateMealPlanValue = (uri: string, value: Record<string, unknown>): MealPlanValue => {
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof value[field] !== 'string') {
      throw new Error(
        `invalid ${MEAL_PLAN_COLLECTION}: required field "${field}" missing or not a string in ${uri}`,
      );
    }
  }
  const weeks = value['weeks'];
  if (!Array.isArray(weeks)) {
    throw new Error(
      `invalid ${MEAL_PLAN_COLLECTION}: required field "weeks" missing or not an array in ${uri}`,
    );
  }
  weeks.forEach((week, i) => {
    const days =
      week !== null && typeof week === 'object' ? (week as Record<string, unknown>)['days'] : undefined;
    if (!Array.isArray(days) || days.length !== 7) {
      throw new Error(`invalid ${MEAL_PLAN_COLLECTION}: week ${i} must have exactly 7 days in ${uri}`);
    }
  });
  return value as MealPlanValue;
};

/** Build a single meal placing the given recipe (by strongRef), optional note. */
export const mealWithRecipe = (entry: { uri: string; cid: string }, note?: string): PlanMeal => ({
  recipe: strongRefOf(entry),
  ...(note !== undefined ? { note } : {}),
});

/** The meals on a day, migrating a legacy single-recipe slot to a one-meal list.
 * A slot with an explicit `meals` array is authoritative (even when empty); only
 * when `meals` is absent do we fall back to the legacy `recipe`/`note`. Pure. */
export const mealsOfSlot = (slot: PlanSlot): PlanMeal[] => {
  if (Array.isArray(slot.meals)) return slot.meals;
  if (slot.recipe !== undefined) {
    return [{ recipe: slot.recipe, ...(slot.note !== undefined ? { note: slot.note } : {}) }];
  }
  return [];
};

/** Coerce a possibly-absent/out-of-range meals-per-day cap into [1,6]. A caller
 * may pass a floor (e.g. the largest day already placed) so opening an existing
 * plan never renders a day as over-cap; the result is at least that floor. */
export const clampMealsPerDay = (value: number | undefined, floor = MEALS_PER_DAY_MIN): number => {
  const n = Math.floor(Number(value));
  const base = Number.isFinite(n) && n >= MEALS_PER_DAY_MIN ? Math.min(MEALS_PER_DAY_MAX, n) : MEALS_PER_DAY_DEFAULT;
  return Math.min(MEALS_PER_DAY_MAX, Math.max(base, Math.max(MEALS_PER_DAY_MIN, floor)));
};

/** Coerce a possibly-absent/out-of-range repeat into [1,12] (default 1). */
const clampRepeat = (repeat: number | undefined): number => {
  const n = Math.floor(Number(repeat));
  if (!Number.isFinite(n) || n < REPEAT_MIN) return REPEAT_MIN;
  return Math.min(REPEAT_MAX, n);
};

/** Expand weeks into the flat calendar: each week stamped `repeat` times, in
 * array order, rep ascending. Pure — the record stores weeks, the calendar is
 * derived at render time. */
export const expandCalendar = (weeks: PlanWeek[]): CalendarWeek[] =>
  weeks.flatMap((week, i) => {
    const reps = clampRepeat(week.repeat);
    return Array.from({ length: reps }, (_unused, k): CalendarWeek => ({
      week: i + 1,
      rep: k + 1,
      days: week.days,
    }));
  });
