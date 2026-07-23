// Feature B (seasonality) — the pure matcher + boost. Seasonality is only ever
// a boost, never a drag (B1): `applySeasonBoost` can float in-season recipes up
// but never removes one and never demotes a boosted one below where it sat.
// Matching is curated-alias only (B-D3): a recipe ingredient matches a produce
// item solely through the curated `aliases` list, reusing the existing
// conservative ingredient normalization (`parseIngredient`). No stemming beyond
// what already ships, no substring matching, no embeddings.

import type { CachedRecipe } from '../recipes/cache.js';
import { parseIngredient } from '../recipes/shopping-list.js';
import { PRODUCE, type RegionId } from './produce.js';

const byId = new Map(PRODUCE.map((prod) => [prod.id, prod]));

// Curated-alias index: normalized alias → produce id. Aliases are normalized
// through the SAME parser as recipe ingredient lines, so "cherry tomatoes" in a
// recipe and the alias "cherry tomato" fold to the same key.
const aliasIndex = new Map<string, string>();
for (const prod of PRODUCE) {
  for (const alias of prod.aliases) {
    const key = parseIngredient(alias).name;
    if (key !== '') aliasIndex.set(key, prod.id);
  }
}

/** Current calendar month, 1-12. Injectable for tests. */
export const currentMonth = (now: Date = new Date()): number => now.getMonth() + 1;

/** Is this produce in season in the given month + region? Unknown id → false. */
export const isInSeason = (produceId: string, month: number, region: RegionId): boolean =>
  (byId.get(produceId)?.seasons[region] ?? []).includes(month);

/** Match a normalized ingredient name (a `parseIngredient(line).name`) to a
 *  produce id — ONLY via the curated alias list. A near-miss that merely
 *  contains a produce word is not a match. */
export const matchProduce = (normalizedName: string): string | null =>
  normalizedName === '' ? null : (aliasIndex.get(normalizedName) ?? null);

type RecipeValue = Record<string, unknown>;

const ingredientLines = (value: RecipeValue): string[] => {
  const raw = value['ingredients'];
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
};

/** The distinct produce ids in a recipe that are in season now. */
export const recipeSeasonalMatches = (
  value: RecipeValue,
  month: number,
  region: RegionId,
): string[] => {
  const ids = new Set<string>();
  for (const line of ingredientLines(value)) {
    const id = matchProduce(parseIngredient(line).name);
    if (id !== null && isInSeason(id, month, region)) ids.add(id);
  }
  return [...ids];
};

/** Non-negative boost: how many distinct in-season produce a recipe contains.
 *  0 when nothing matches or nothing is in season. */
export const seasonBoost = (value: RecipeValue, month: number, region: RegionId): number =>
  recipeSeasonalMatches(value, month, region).length;

export interface SeasonContext {
  month: number;
  region: RegionId;
}

/** Float in-season recipes toward the front — a STABLE partition, so a boosted
 *  recipe never drops and the relative order within each group is preserved.
 *  Never removes an entry. Pure (does not mutate the input). */
export const applySeasonBoost = (entries: CachedRecipe[], ctx: SeasonContext): CachedRecipe[] => {
  const inSeason: CachedRecipe[] = [];
  const rest: CachedRecipe[] = [];
  for (const entry of entries) {
    (seasonBoost(entry.value, ctx.month, ctx.region) > 0 ? inSeason : rest).push(entry);
  }
  return [...inSeason, ...rest];
};

/** The gated entry point: with the setting off, the ranking is byte-identical
 *  to the unboosted input (B-D6). */
export const rankWithSeason = (
  entries: CachedRecipe[],
  opts: { enabled: boolean } & SeasonContext,
): CachedRecipe[] => (opts.enabled ? applySeasonBoost(entries, opts) : entries);

/** URIs of the entries with at least one in-season ingredient — for badging. */
export const inSeasonUriSet = (
  entries: CachedRecipe[],
  ctx: SeasonContext,
): Set<string> => {
  const set = new Set<string>();
  for (const entry of entries) {
    if (seasonBoost(entry.value, ctx.month, ctx.region) > 0) set.add(entry.uri);
  }
  return set;
};

/** Distinct display names of the in-season produce found across these recipes —
 *  for the "In season now" strip. Surfaces what's good right now (B0), not a
 *  duplicate of the recipe cards. */
export const inSeasonProduce = (entries: CachedRecipe[], ctx: SeasonContext): string[] => {
  const ids = new Set<string>();
  for (const entry of entries) {
    for (const id of recipeSeasonalMatches(entry.value, ctx.month, ctx.region)) ids.add(id);
  }
  return [...ids].map((id) => byId.get(id)?.display ?? id);
};
