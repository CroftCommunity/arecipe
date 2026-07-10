// Phase 4: the local meal-plan store — a localStorage-backed in-flight buffer
// (the PDS record is the durable home; see the plan's persistence reasoning).
// Behavior via the public API, with an injected in-memory storage + logger so
// there is no cross-test bleed and the fail posture is observable.
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../src/log.js';
import {
  createMealPlanStore,
  type LocalPlanInput,
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

const aPlan = (name: string): LocalPlanInput => ({
  name,
  weeks: [
    {
      repeat: 1,
      days: Array.from({ length: 7 }, () => ({})),
    },
  ],
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

  it('preserves the display-cached recipe ref + note on a day slot', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const input: LocalPlanInput = {
      name: 'with a recipe',
      weeks: [
        {
          repeat: 2,
          days: [
            { recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' }, note: 'big batch' },
            ...Array.from({ length: 6 }, () => ({})),
          ],
        },
      ],
    };
    const saved = store.save(input);
    const back = store.get(saved.id);
    expect(back?.weeks[0]?.repeat).toBe(2);
    expect(back?.weeks[0]?.days[0]).toEqual({
      recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' },
      note: 'big batch',
    });
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
