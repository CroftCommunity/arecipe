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
import { MEAL_PLAN_COLLECTION, slotWithRecipe, validateMealPlanValue } from './meal-plan.js';
import type { LocalPlan, LocalSlot, LocalWeek } from './meal-plan-local.js';

export { MEAL_PLAN_COLLECTION };

const slotToRecord = (slot: LocalSlot): Record<string, unknown> => {
  if (slot.recipe === undefined) return {};
  return {
    ...slotWithRecipe({ uri: slot.recipe.uri, cid: slot.recipe.cid }, slot.note),
    name: slot.recipe.name, // open-world display-name cache (see module note)
  };
};

/** Build the app.arecipe.mealPlan record value from a local plan. */
export const planToRecord = (plan: LocalPlan): Record<string, unknown> => ({
  $type: MEAL_PLAN_COLLECTION,
  name: plan.name,
  weeks: plan.weeks.map((w) => ({ repeat: w.repeat, days: w.days.map(slotToRecord) })),
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

/** Map a validated record value back to the local buffer shape (with names). */
const planFromRecord = (uri: string, value: Record<string, unknown>): LocalPlan => {
  const v = validateMealPlanValue(uri, value);
  const weeks: LocalWeek[] = v.weeks.map((w) => {
    const raw = w as { repeat?: unknown; days: Record<string, unknown>[] };
    const repeat = typeof raw.repeat === 'number' ? raw.repeat : 1;
    const days: LocalSlot[] = raw.days.map((d) => {
      const recipe = d['recipe'] as { uri?: unknown; cid?: unknown } | undefined;
      const name = d['name'];
      if (recipe === undefined || typeof recipe.uri !== 'string' || typeof recipe.cid !== 'string') {
        return {};
      }
      const slot: LocalSlot = {
        recipe: { uri: recipe.uri, cid: recipe.cid, name: typeof name === 'string' ? name : '(recipe)' },
      };
      if (typeof d['note'] === 'string') slot.note = d['note'];
      return slot;
    });
    return { repeat, days };
  });
  return {
    id: rkeyFromUri(uri),
    name: v.name,
    weeks,
    ...(typeof v.startDate === 'string' ? { startDate: v.startDate } : {}),
    updatedAt: v.updatedAt,
  };
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
