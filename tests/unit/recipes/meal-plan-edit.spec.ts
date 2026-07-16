// Edit-published-plans staging (plans/2026-07-16-3): a published plan opens in
// the planner as a STAGED local copy that remembers its source rkey (`editOf`).
// Publishing the copy re-putRecords under that rkey — an in-place replace that
// keeps the share link — while the plain planner never adopts a staged copy as
// its working plan. Hermetic: an injected in-memory storage backs the store.
import { describe, expect, it } from 'vitest';
import {
  createMealPlanStore,
  type LocalPlan,
  type StorageLike,
} from '../../../src/recipes/meal-plan-local.js';
import {
  findStagedEdit,
  latestPlan,
  stagePlanForEdit,
  workingPlans,
} from '../../../src/recipes/meal-plan-edit.js';

const memStorage = (): StorageLike => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};

/** A published plan as getPdsPlan recovers it: id = the PDS rkey. */
const publishedPlan = (): LocalPlan => ({
  id: 'pub-rkey-1',
  name: 'My meal plan',
  mealsPerDay: 3,
  startDate: '2026-07-20',
  updatedAt: '2026-07-10T00:00:00.000Z',
  weeks: [
    {
      repeat: 1,
      days: [
        { meals: [{ recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' }, category: 'dinner' }] },
        ...Array.from({ length: 6 }, () => ({ meals: [] })),
      ],
    },
  ],
});

describe('stagePlanForEdit', () => {
  it('stages a published plan as a local copy: fresh id, editOf = the published rkey, content kept', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const staged = stagePlanForEdit(store, publishedPlan());
    expect(staged.id).not.toBe('pub-rkey-1'); // its own local identity…
    expect(staged.editOf).toBe('pub-rkey-1'); // …remembering where to publish back
    expect(staged.name).toBe('My meal plan');
    expect(staged.startDate).toBe('2026-07-20');
    expect(staged.mealsPerDay).toBe(3);
    expect(staged.weeks[0]?.days[0]?.meals[0]?.recipe.name).toBe('Lasagna');
    // The staged copy is persisted (survives a reload of the edit page).
    expect(store.get(staged.id)?.editOf).toBe('pub-rkey-1');
  });

  it('resumes the existing staged copy instead of staging a second one', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const first = stagePlanForEdit(store, publishedPlan());
    // In-flight edit: the staged copy has drifted from the published record.
    store.save({ name: 'edited', weeks: first.weeks, editOf: 'pub-rkey-1' }, first.id);
    const resumed = stagePlanForEdit(store, publishedPlan());
    expect(resumed.id).toBe(first.id);
    expect(resumed.name).toBe('edited'); // the in-flight edit wins, not a re-fetch
    expect(store.list()).toHaveLength(1);
  });
});

describe('findStagedEdit', () => {
  it('finds the staged copy by its published rkey, undefined when none exists', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    expect(findStagedEdit(store, 'pub-rkey-1')).toBeUndefined();
    const staged = stagePlanForEdit(store, publishedPlan());
    expect(findStagedEdit(store, 'pub-rkey-1')?.id).toBe(staged.id);
    expect(findStagedEdit(store, 'other-rkey')).toBeUndefined();
  });
});

describe('latestPlan', () => {
  it('picks the most recently updated plan (input order irrelevant); undefined on empty', () => {
    const older = { ...publishedPlan(), id: 'older', updatedAt: '2026-07-01T00:00:00.000Z' };
    const newer = { ...publishedPlan(), id: 'newer', updatedAt: '2026-07-12T00:00:00.000Z' };
    expect(latestPlan([older, newer])?.id).toBe('newer');
    expect(latestPlan([newer, older])?.id).toBe('newer');
    expect(latestPlan([])).toBeUndefined();
  });

  it('does not reorder the caller’s array', () => {
    const older = { ...publishedPlan(), id: 'older', updatedAt: '2026-07-01T00:00:00.000Z' };
    const newer = { ...publishedPlan(), id: 'newer', updatedAt: '2026-07-12T00:00:00.000Z' };
    const input = [older, newer];
    latestPlan(input);
    expect(input.map((p) => p.id)).toEqual(['older', 'newer']);
  });
});

describe('workingPlans', () => {
  it('filters staged edit copies out — the plain planner never adopts one', () => {
    const store = createMealPlanStore({ storage: memStorage() });
    const working = store.save({ name: 'working', weeks: publishedPlan().weeks });
    stagePlanForEdit(store, publishedPlan()); // newer updatedAt → list()[0]
    expect(store.list().length).toBe(2);
    expect(workingPlans(store).map((p) => p.id)).toEqual([working.id]);
  });
});
