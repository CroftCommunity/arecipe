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

/** The subset of the Web Storage API the store depends on (injectable for tests). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A day slot as the buffer holds it: the recipe ref carries a cached display
 * name (the record shape drops the name — that is Phase 9's concern). */
export type LocalSlot = {
  recipe?: { uri: string; cid: string; name: string };
  note?: string;
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
  startDate?: string;
  updatedAt: string;
};

/** What a caller supplies to save — content only; id + updatedAt are managed. */
export type LocalPlanInput = {
  name: string;
  weeks: LocalWeek[];
  startDate?: string;
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
      return parsed !== null && typeof parsed === 'object'
        ? (parsed as Record<string, LocalPlan>)
        : {};
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
      const stored: LocalPlan = {
        id: resolvedId,
        name: plan.name,
        weeks: plan.weeks,
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
