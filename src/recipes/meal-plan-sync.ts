// Meal-plan ↔ PDS sync (Phase 9): app.arecipe.mealPlan records make a plan
// durable and cross-browser — the PDS record is the home, the local store is
// the in-flight buffer. Mirrors drafts-sync: putRecord on save (stable
// id-derived rkey → re-saves overwrite), delete on remove, public listRecords
// on recovery with fail-loud-per-record validation.
//
// The record stores strongRef slots ({uri,cid}) per the lexicon; we additionally
// cache the display `name` as an open-world extra on each filled slot so a plan
// recovered on a fresh device shows real recipe names, not placeholders. The
// strongRef stays authoritative; the cached name is a non-authoritative hint.

import type { Agent } from '@atproto/api';
import { log } from '../log.js';
import { clampMealsPerDay, mealWithRecipe, MEAL_PLAN_COLLECTION, validateMealPlanValue } from './meal-plan.js';
import type { LocalMeal, LocalPlan, LocalSlot, LocalWeek } from './meal-plan-local.js';

export { MEAL_PLAN_COLLECTION };

const mealToRecord = (meal: LocalMeal): Record<string, unknown> => ({
  ...mealWithRecipe({ uri: meal.recipe.uri, cid: meal.recipe.cid }, meal.note),
  name: meal.recipe.name, // open-world display-name cache (see module note)
  ...(meal.category !== undefined ? { category: meal.category } : {}), // meal-type cache
});

const slotToRecord = (slot: LocalSlot): Record<string, unknown> => ({
  meals: slot.meals.map(mealToRecord),
});

/** Build the app.arecipe.mealPlan record value from a local plan. */
export const planToRecord = (plan: LocalPlan): Record<string, unknown> => ({
  $type: MEAL_PLAN_COLLECTION,
  name: plan.name,
  weeks: plan.weeks.map((w) => ({ repeat: w.repeat, days: w.days.map(slotToRecord) })),
  mealsPerDay: plan.mealsPerDay,
  ...(plan.startDate !== undefined ? { startDate: plan.startDate } : {}),
  // LocalPlan tracks only updatedAt; v1 stamps createdAt = updatedAt on write.
  createdAt: plan.updatedAt,
  updatedAt: plan.updatedAt,
});

/** rkey = the stable local plan id, so re-saves overwrite (idempotent). */
const rkeyOf = (id: string): string => id;

export const syncPlanToPds = async (agent: Agent, plan: LocalPlan): Promise<void> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to sync the meal plan to');
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: MEAL_PLAN_COLLECTION,
    rkey: rkeyOf(plan.id),
    record: planToRecord(plan),
  });
  log.info('meal-plan', 'synced to PDS', { id: plan.id });
};

export const removePlanFromPds = async (agent: Agent, id: string): Promise<void> => {
  const did = agent.did;
  if (did === undefined) return;
  try {
    await agent.com.atproto.repo.deleteRecord({ repo: did, collection: MEAL_PLAN_COLLECTION, rkey: id });
    log.info('meal-plan', 'removed from PDS', { id });
  } catch (err) {
    // Absent remote copy is fine (the plan may never have synced).
    log.debug('meal-plan', 'PDS remove skipped', { id, error: String(err) });
  }
};

const rkeyFromUri = (uri: string): string => uri.split('/').pop() ?? uri;

/** One meal from a record entry: the strongRef plus the cached name/category
 * hints. Null when the entry carries no valid recipe strongRef. */
const mealFromRecord = (raw: unknown): LocalMeal | null => {
  if (raw === null || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const recipe = d['recipe'] as { uri?: unknown; cid?: unknown } | undefined;
  if (recipe === undefined || typeof recipe.uri !== 'string' || typeof recipe.cid !== 'string') return null;
  const meal: LocalMeal = {
    recipe: { uri: recipe.uri, cid: recipe.cid, name: typeof d['name'] === 'string' ? d['name'] : '(recipe)' },
  };
  if (typeof d['category'] === 'string') meal.category = d['category'];
  if (typeof d['note'] === 'string') meal.note = d['note'];
  return meal;
};

/** Map a validated record value back to the local buffer shape (with names).
 * Reads the multi-meal `days[].meals[]` shape; migrates a legacy single-`recipe`
 * slot to a one-meal day so plans written before multi-meal open unchanged. */
const planFromRecord = (uri: string, value: Record<string, unknown>): LocalPlan => {
  const v = validateMealPlanValue(uri, value);
  const weeks: LocalWeek[] = v.weeks.map((w) => {
    const raw = w as { repeat?: unknown; days: Record<string, unknown>[] };
    const repeat = typeof raw.repeat === 'number' ? raw.repeat : 1;
    const days: LocalSlot[] = raw.days.map((d) => {
      const rawMeals = d['meals'];
      const meals = Array.isArray(rawMeals)
        ? rawMeals.map(mealFromRecord).filter((m): m is LocalMeal => m !== null)
        : [mealFromRecord(d)].filter((m): m is LocalMeal => m !== null); // legacy single-recipe slot
      return { meals };
    });
    return { repeat, days };
  });
  const maxDay = weeks.reduce((m, w) => Math.max(m, ...w.days.map((day) => day.meals.length), 0), 0);
  return {
    id: rkeyFromUri(uri),
    name: v.name,
    weeks,
    mealsPerDay: clampMealsPerDay(typeof v.mealsPerDay === 'number' ? v.mealsPerDay : undefined, maxDay),
    ...(typeof v.startDate === 'string' ? { startDate: v.startDate } : {}),
    updatedAt: v.updatedAt,
  };
};

/** Read a single synced plan by rkey via public `getRecord` — the read path for
 *  a shared plan link (`meals.html?mealplan=<rkey>&user=<did>`), which any
 *  visitor (including anon) can open. Throws on a missing/unreadable record or a
 *  record that fails meal-plan validation. */
export const getPdsPlan = async (
  pds: string,
  did: string,
  rkey: string,
  opts: { fetchFn?: typeof fetch } = {},
): Promise<LocalPlan> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn(
    `${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${MEAL_PLAN_COLLECTION}&rkey=${encodeURIComponent(rkey)}`,
  );
  if (!res.ok) throw new Error(`meal-plan get failed (HTTP ${res.status})`);
  const body = (await res.json()) as { uri: string; value: Record<string, unknown> };
  return planFromRecord(body.uri, body.value);
};

/** Pull the account's synced plans (public read of own repo); skip malformed. */
export const listPdsPlans = async (
  pds: string,
  did: string,
  opts: { fetchFn?: typeof fetch } = {},
): Promise<LocalPlan[]> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn(
    `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${MEAL_PLAN_COLLECTION}&limit=100`,
  );
  if (!res.ok) throw new Error(`meal-plan list failed (HTTP ${res.status})`);
  const body = (await res.json()) as { records: { uri: string; value: Record<string, unknown> }[] };
  const plans: LocalPlan[] = [];
  for (const record of body.records) {
    try {
      plans.push(planFromRecord(record.uri, record.value));
    } catch (err) {
      log.warn('meal-plan', 'skipping malformed PDS plan', { error: String(err) });
    }
  }
  return plans;
};
