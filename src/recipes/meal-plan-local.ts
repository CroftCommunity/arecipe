// Meal-plan local store (Phase 4): a localStorage-backed in-flight editing
// buffer. The PDS record (Phase 9) is the durable, cross-browser home; this
// buffer is what the page reads/writes on every tap and is rehydrated from the
// PDS on a fresh browser. localStorage (not IndexedDB like drafts) is a
// deliberate choice — a single small plan needs no object-store machinery, and
// a synchronous read/write gives the tap-to-place UI a clean optimistic loop.
//
// Fail posture (mirrors the drafts model): the store does NOT swallow storage
// errors — a getItem/setItem that throws (quota, disabled, private mode)
// propagates to the call site, which wraps it and warns. The one tolerance is a
// corrupt/undecodable stored value on read: it yields an empty result and logs
// a warn rather than throwing, so a garbled buffer never bricks the planner.

import { log as defaultLogger, type Logger } from '../log.js';
import { clampMealsPerDay } from './meal-plan.js';

/** The subset of the Web Storage API the store depends on (injectable for tests). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** One placed meal as the buffer holds it: the recipe ref plus cached display
 * hints — `name` (shown offline / on a fresh device) and `category` (the recipe's
 * own meal type, e.g. "breakfast", which the calendar renders as its label).
 * Both caches are non-authoritative; the strongRef is the source of truth. */
export type LocalMeal = {
  recipe: { uri: string; cid: string; name: string };
  category?: string;
  note?: string;
};

/** A day cell as the buffer holds it: an ordered list of meals (0..cap). */
export type LocalSlot = {
  meals: LocalMeal[];
};

export type LocalWeek = {
  repeat: number;
  days: LocalSlot[];
};

/** A persisted plan: the editable content plus the store-managed id + stamp. */
export type LocalPlan = {
  id: string;
  name: string;
  weeks: LocalWeek[];
  /** Editor cap: how many meals a day may hold (1–6). */
  mealsPerDay: number;
  startDate?: string;
  updatedAt: string;
};

/** What a caller supplies to save — content only; id + updatedAt are managed. */
export type LocalPlanInput = {
  name: string;
  weeks: LocalWeek[];
  mealsPerDay?: number;
  startDate?: string;
};

const cloneMeal = (meal: LocalMeal): LocalMeal => ({
  recipe: { ...meal.recipe },
  ...(meal.category !== undefined ? { category: meal.category } : {}),
  ...(meal.note !== undefined ? { note: meal.note } : {}),
});

const cloneSlot = (slot: LocalSlot): LocalSlot => ({ meals: slot.meals.map(cloneMeal) });

const cloneWeek = (week: LocalWeek): LocalWeek => ({
  repeat: week.repeat,
  days: week.days.map(cloneSlot),
});

/** Append a deep copy of every currently-planned week — the "Repeat planned
 * weeks" action, which duplicates the whole plan instead of adding a blank
 * week. Pure: returns a new array with independent copies (editing a duplicate
 * never mutates the source). If doubling would exceed `max`, the input is
 * returned unchanged (the caller disables the control in that case). */
export const duplicateWeeks = (weeks: LocalWeek[], max: number): LocalWeek[] => {
  if (weeks.length === 0 || weeks.length * 2 > max) return weeks;
  return [...weeks, ...weeks.map(cloneWeek)];
};

/** Migrate a stored day slot to the meals-array shape: an explicit `meals` list
 * is kept; a legacy single-`recipe` slot becomes a one-meal list; anything else
 * becomes an empty day. Tolerant of the raw JSON shape (returning users may hold
 * a pre-multi-meal buffer). Pure. */
const migrateStoredSlot = (raw: unknown): LocalSlot => {
  if (raw === null || typeof raw !== 'object') return { meals: [] };
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o['meals'])) {
    const meals = o['meals'].filter(
      (m): m is LocalMeal =>
        m !== null &&
        typeof m === 'object' &&
        typeof (m as { recipe?: { uri?: unknown } }).recipe?.uri === 'string',
    );
    return { meals };
  }
  const legacy = o['recipe'] as { uri?: unknown; cid?: unknown; name?: unknown } | undefined;
  if (legacy !== undefined && typeof legacy.uri === 'string' && typeof legacy.cid === 'string') {
    const meal: LocalMeal = {
      recipe: { uri: legacy.uri, cid: legacy.cid, name: typeof legacy.name === 'string' ? legacy.name : '(recipe)' },
      ...(typeof o['note'] === 'string' ? { note: o['note'] } : {}),
    };
    return { meals: [meal] };
  }
  return { meals: [] };
};

/** Normalize a stored plan into the current shape (slots → meals arrays, a
 * defaulted `mealsPerDay` never below the largest day already placed). */
const migrateStoredPlan = (raw: LocalPlan): LocalPlan => {
  const weeks: LocalWeek[] = Array.isArray(raw.weeks)
    ? raw.weeks.map((w) => {
        const wr = w as unknown as { repeat?: unknown; days?: unknown };
        const days = Array.isArray(wr.days) ? wr.days.map(migrateStoredSlot) : [];
        return { repeat: typeof wr.repeat === 'number' ? wr.repeat : 1, days };
      })
    : [];
  const maxDay = weeks.reduce((m, w) => Math.max(m, ...w.days.map((d) => d.meals.length), 0), 0);
  const stored = typeof raw.mealsPerDay === 'number' ? raw.mealsPerDay : undefined;
  const mealsPerDay = clampMealsPerDay(stored, maxDay);
  return { ...raw, weeks, mealsPerDay };
};

export type MealPlanStore = {
  list: () => LocalPlan[];
  get: (id: string) => LocalPlan | undefined;
  save: (plan: LocalPlanInput, id?: string) => LocalPlan;
  remove: (id: string) => void;
};

const STORAGE_KEY = 'arecipe.mealplans.v1';

export const createMealPlanStore = (
  opts: { storage?: StorageLike; logger?: Logger } = {},
): MealPlanStore => {
  const storage = opts.storage ?? window.localStorage;
  const logger = opts.logger ?? defaultLogger;

  // Read the whole id→plan map. A read that throws propagates; a corrupt value
  // degrades to empty (with a warn) rather than throwing.
  const readAll = (): Record<string, LocalPlan> => {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object') return {};
      const out: Record<string, LocalPlan> = {};
      for (const [id, plan] of Object.entries(parsed as Record<string, LocalPlan>)) {
        out[id] = migrateStoredPlan(plan);
      }
      return out;
    } catch (err) {
      logger.warn('meal-plan', 'discarding corrupt stored plan', { error: String(err) });
      return {};
    }
  };

  const writeAll = (all: Record<string, LocalPlan>): void => {
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
  };

  return {
    list: () =>
      Object.values(readAll()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    get: (id) => readAll()[id],
    save: (plan, id) => {
      const all = readAll();
      const resolvedId = id ?? crypto.randomUUID();
      const maxDay = plan.weeks.reduce((m, w) => Math.max(m, ...w.days.map((d) => d.meals.length), 0), 0);
      const stored: LocalPlan = {
        id: resolvedId,
        name: plan.name,
        weeks: plan.weeks,
        mealsPerDay: clampMealsPerDay(plan.mealsPerDay, maxDay),
        ...(plan.startDate !== undefined ? { startDate: plan.startDate } : {}),
        updatedAt: new Date().toISOString(),
      };
      all[resolvedId] = stored;
      writeAll(all);
      logger.debug('meal-plan', 'saved', { id: resolvedId });
      return stored;
    },
    remove: (id) => {
      const all = readAll();
      delete all[id];
      writeAll(all);
      logger.debug('meal-plan', 'removed', { id });
    },
  };
};
