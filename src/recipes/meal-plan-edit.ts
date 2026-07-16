// Edit-published-plans staging (plans/2026-07-16-3): a published plan opens in
// the planner as a STAGED local copy that remembers its source rkey (`editOf`).
// The copy edits like any local plan but is NOT write-through synced; publishing
// it re-putRecords under the original rkey (meal-plan-sync's rkeyOf), replacing
// the published record in place so the share link keeps working. Pure store
// operations — no DOM, no network (the page fetches; this module stages).

import type { LocalPlan, MealPlanStore } from './meal-plan-local.js';

/** The staged local copy of a published plan (by its rkey), if one exists. */
export const findStagedEdit = (store: MealPlanStore, rkey: string): LocalPlan | undefined =>
  store.list().find((p) => p.editOf === rkey);

/** Stage a published plan for editing: resume the existing staged copy (an
 * in-flight edit wins over a re-fetch) or persist a fresh one — its own local
 * id, `editOf` = the published rkey, content copied from the published plan. */
export const stagePlanForEdit = (store: MealPlanStore, published: LocalPlan): LocalPlan => {
  const existing = findStagedEdit(store, published.id);
  if (existing !== undefined) return existing;
  return store.save({
    name: published.name,
    weeks: published.weeks,
    mealsPerDay: published.mealsPerDay,
    ...(published.startDate !== undefined ? { startDate: published.startDate } : {}),
    editOf: published.id,
  });
};

/** Plans the plain planner may adopt as its working plan — staged edit copies
 * are excluded (adopting one would write-through-edit the published record). */
export const workingPlans = (store: MealPlanStore): LocalPlan[] =>
  store.list().filter((p) => p.editOf === undefined);
