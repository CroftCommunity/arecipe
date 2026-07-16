// Phase 4: the local meal-plan store — a localStorage-backed in-flight buffer
// (the PDS record is the durable home; see the plan's persistence reasoning).
// Behavior via the public API, with an injected in-memory storage + logger so
// there is no cross-test bleed and the fail posture is observable.
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../src/log.js';
import {
  createMealPlanStore,
  duplicateWeeks,
  type LocalPlanInput,
  type LocalWeek,
  type StorageLike,
} from '../../../src/recipes/meal-plan-local.js';

const memStorage = (initial: Record<string, string> = {}): StorageLike => {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};

const recordingLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const emptyDay = () => ({ meals: [] });

const aPlan = (name: string): LocalPlanInput => ({
  name,
  weeks: [
    {
      repeat: 1,
      days: Array.from({ length: 7 }, emptyDay),
    },
  ],
});

describe('duplicateWeeks', () => {
  const week = (name: string): LocalWeek => ({
    repeat: 1,
    days: Array.from({ length: 7 }, (_unused, i) =>
      i === 0 ? { meals: [{ recipe: { uri: `at://x/${name}`, cid: `cid-${name}`, name } }] } : { meals: [] },
    ),
  });

  it('appends a deep copy of every planned week, doubling the plan', () => {
    const weeks = [week('a'), week('b')];
    const out = duplicateWeeks(weeks, 6);
    expect(out).toHaveLength(4);
    expect(out[2]?.days[0]?.meals[0]?.recipe.name).toBe('a');
    expect(out[3]?.days[0]?.meals[0]?.recipe.name).toBe('b');
  });

  it('deep-copies so editing a duplicate does not mutate the original', () => {
    const weeks = [week('a')];
    const out = duplicateWeeks(weeks, 6);
    out[1]!.days[0] = { meals: [] }; // clear the copy's first slot
    expect(out[0]?.days[0]?.meals[0]?.recipe.name).toBe('a'); // original untouched
  });

  it('refuses to duplicate when doubling would exceed the max (returns input)', () => {
    const weeks = [week('a'), week('b'), week('c'), week('d')]; // 4 → 8 > 6
    expect(duplicateWeeks(weeks, 6)).toBe(weeks);
  });

  it('allows duplication that lands exactly on the max', () => {
    const weeks = [week('a'), week('b'), week('c')]; // 3 → 6 == max
    expect(duplicateWeeks(weeks, 6)).toHaveLength(6);
  });
});

describe('createMealPlanStore', () => {
  it('round-trips a saved plan through list() and get()', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const saved = store.save(aPlan('Week one'));
    expect(saved.id).toBeTruthy();
    expect(saved.updatedAt).toBeTruthy();
    expect(store.list().map((p) => p.name)).toEqual(['Week one']);
    expect(store.get(saved.id)?.name).toBe('Week one');
  });

  it('overwrites when saving with the same id (single implicit plan in v1)', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const first = store.save(aPlan('draft'));
    store.save(aPlan('renamed'), first.id);
    expect(store.list()).toHaveLength(1);
    expect(store.get(first.id)?.name).toBe('renamed');
  });

  it('remove() deletes the plan', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const saved = store.save(aPlan('gone soon'));
    store.remove(saved.id);
    expect(store.list()).toEqual([]);
    expect(store.get(saved.id)).toBeUndefined();
  });

  it('preserves the display-cached meals (ref + category + note) on a day slot', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const input: LocalPlanInput = {
      name: 'with meals',
      mealsPerDay: 3,
      weeks: [
        {
          repeat: 2,
          days: [
            {
              meals: [
                { recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' }, category: 'dinner', note: 'big batch' },
                { recipe: { uri: 'at://d/c/r2', cid: 'bafyy', name: 'Oatmeal' }, category: 'breakfast' },
              ],
            },
            ...Array.from({ length: 6 }, emptyDay),
          ],
        },
      ],
    };
    const saved = store.save(input);
    const back = store.get(saved.id);
    expect(back?.weeks[0]?.repeat).toBe(2);
    expect(back?.mealsPerDay).toBe(3);
    expect(back?.weeks[0]?.days[0]?.meals).toEqual([
      { recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' }, category: 'dinner', note: 'big batch' },
      { recipe: { uri: 'at://d/c/r2', cid: 'bafyy', name: 'Oatmeal' }, category: 'breakfast' },
    ]);
  });

  it('persists editOf (a staged edit of a published plan) and round-trips it', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const staged = store.save({ ...aPlan('staged copy'), editOf: 'pub-rkey' });
    expect(staged.editOf).toBe('pub-rkey');
    expect(store.get(staged.id)?.editOf).toBe('pub-rkey');
    expect(store.list()[0]?.editOf).toBe('pub-rkey');
  });

  it('leaves editOf absent on ordinary plans (never stamps the field)', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const saved = store.save(aPlan('ordinary'));
    expect(saved.editOf).toBeUndefined();
    expect('editOf' in (store.get(saved.id) ?? {})).toBe(false);
  });

  it('defaults mealsPerDay when the input omits it', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const saved = store.save(aPlan('no cap set'));
    expect(saved.mealsPerDay).toBe(3); // MEALS_PER_DAY_DEFAULT
  });

  it('never stores a cap below the largest day already placed', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const saved = store.save({
      name: 'four on monday',
      mealsPerDay: 1, // user tried to shrink below what is placed
      weeks: [
        {
          repeat: 1,
          days: [
            { meals: Array.from({ length: 4 }, (_u, i) => ({ recipe: { uri: `at://x/${i}`, cid: `c${i}`, name: `R${i}` } })) },
            ...Array.from({ length: 6 }, emptyDay),
          ],
        },
      ],
    });
    expect(saved.mealsPerDay).toBe(4);
  });

  it('migrates a legacy single-recipe stored plan to the meals shape on read', () => {
    const legacy = {
      'plan-1': {
        id: 'plan-1',
        name: 'Legacy week',
        updatedAt: '2026-07-01T00:00:00.000Z',
        weeks: [
          {
            repeat: 1,
            days: [
              { recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' }, note: 'x2' },
              ...Array.from({ length: 6 }, () => ({})),
            ],
          },
        ],
      },
    };
    const store = createMealPlanStore({
      storage: memStorage({ 'arecipe.mealplans.v1': JSON.stringify(legacy) }),
    });
    const back = store.get('plan-1');
    expect(back?.weeks[0]?.days[0]?.meals).toEqual([
      { recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' }, note: 'x2' },
    ]);
    expect(back?.weeks[0]?.days[1]?.meals).toEqual([]);
    // A legacy plan with no cap defaults to at least the default.
    expect(back?.mealsPerDay).toBe(3);
  });

  it('logs saved/removed at debug on the success paths', () => {
    const logger = recordingLogger();
    const store = createMealPlanStore({ storage: memStorage(), logger });
    const saved = store.save(aPlan('logged'));
    store.remove(saved.id);
    expect(logger.debug).toHaveBeenCalledWith('meal-plan', 'saved', { id: saved.id });
    expect(logger.debug).toHaveBeenCalledWith('meal-plan', 'removed', { id: saved.id });
  });

  it('tolerates a corrupt stored value: list() is empty and a warn is logged, not a throw', () => {
    const logger = recordingLogger();
    const store = createMealPlanStore({
      storage: memStorage({ 'arecipe.mealplans.v1': 'not json {{{' }),
      logger,
    });
    expect(store.list()).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'meal-plan',
      'discarding corrupt stored plan',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('propagates a throwing storage backend (fail-loud in store, warn at call site)', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
      removeItem: () => undefined,
    };
    const store = createMealPlanStore({ storage: throwing });
    expect(() => store.list()).toThrow(/storage disabled/);
    expect(() => store.save(aPlan('nope'))).toThrow(/storage disabled/);
  });
});
