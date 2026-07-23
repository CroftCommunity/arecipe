// Feature B (seasonality) — the pure logic. Seasonality is only ever a boost,
// never a drag (B1): the ranking helper can float in-season recipes up but can
// never remove one or push a boosted one below where it sat, and with the
// setting off it is byte-identical to the unboosted order. Matching is
// curated-alias only (B-D3) — a fuzzy/substring implementation fails test 5.
import { describe, expect, it } from 'vitest';
import type { CachedRecipe } from '../../../src/recipes/cache.js';
import {
  applySeasonBoost,
  isInSeason,
  matchProduce,
  rankWithSeason,
  seasonBoost,
} from '../../../src/seasonality/season.js';
import { parseIngredient } from '../../../src/recipes/shopping-list.js';

const cached = (over: { uri?: string; ingredients?: string[] } = {}): CachedRecipe => ({
  uri: over.uri ?? `at://did:plc:x/exchange.recipe.recipe/${over.uri ?? 'r'}`,
  cid: 'cid',
  value: { ingredients: over.ingredients ?? [] },
  verified: true,
  cachedAt: '2026-07-08T00:00:00Z',
});

const uris = (entries: readonly CachedRecipe[]): string[] => entries.map((e) => e.uri);

describe('isInSeason', () => {
  it('is true inside the season set and false outside, and differs by region', () => {
    // Tomato is a northern-summer / southern-summer crop: July (7) is in season
    // in the Northern Hemisphere but out of season in the Southern.
    expect(isInSeason('tomato', 7, 'northern-temperate')).toBe(true);
    expect(isInSeason('tomato', 1, 'northern-temperate')).toBe(false);
    expect(isInSeason('tomato', 7, 'southern-temperate')).toBe(false);
    expect(isInSeason('tomato', 1, 'southern-temperate')).toBe(true);
  });

  it('returns false (not throw) for an unknown produce id', () => {
    expect(isInSeason('unicorn-fruit', 7, 'northern-temperate')).toBe(false);
  });
});

describe('seasonBoost', () => {
  it('is 0 for a recipe with no matching ingredient', () => {
    const value = cached({ ingredients: ['2 cups flour', '1 tsp salt', '3 eggs'] }).value;
    expect(seasonBoost(value, 7, 'northern-temperate')).toBe(0);
  });

  it('is positive for a recipe with a matching in-season ingredient', () => {
    // Bare produce name (qty stripped, plural folded) matches the curated
    // alias. A descriptor like "ripe tomatoes" deliberately would NOT match —
    // parseIngredient keeps descriptors and matching is exact (B-D3).
    const value = cached({ ingredients: ['2 tomatoes', '1 tsp salt'] }).value;
    expect(seasonBoost(value, 7, 'northern-temperate')).toBeGreaterThan(0);
  });
});

describe('matchProduce (curated-alias only — B-D3)', () => {
  it('hits a curated alias but misses a near-miss string that is not an alias', () => {
    // Curated alias — plural folds to the same normalized name.
    expect(matchProduce(parseIngredient('cherry tomatoes').name)).toBe('tomato');
    expect(matchProduce(parseIngredient('2 tomatoes').name)).toBe('tomato');
    // Near-miss: contains "tomato" as a substring but is NOT a curated alias.
    // A fuzzy/substring matcher would wrongly return 'tomato' here.
    expect(matchProduce(parseIngredient('sun-dried tomato paste').name)).toBeNull();
    expect(matchProduce('tomatoey')).toBeNull();
  });
});

describe('applySeasonBoost — boost only, never a drag (B-D4)', () => {
  const north = { month: 7, region: 'northern-temperate' as const };

  it('never removes an entry and never demotes a boosted (in-season) entry', () => {
    const a = cached({ uri: 'at://x/1', ingredients: ['flour', 'sugar'] }); // out of season
    const b = cached({ uri: 'at://x/2', ingredients: ['flour'] }); // out of season
    const c = cached({ uri: 'at://x/3', ingredients: ['4 tomatoes'] }); // in season
    const input = [a, b, c];
    const out = applySeasonBoost(input, north);

    // Nothing removed: same multiset of uris.
    expect(new Set(uris(out))).toEqual(new Set(uris(input)));
    expect(out).toHaveLength(input.length);

    // The boosted (in-season) entry never sits lower than it did unboosted.
    const posBefore = uris(input).indexOf('at://x/3');
    const posAfter = uris(out).indexOf('at://x/3');
    expect(posAfter).toBeLessThanOrEqual(posBefore);

    // Stable within groups: the two out-of-season entries keep their order.
    expect(uris(out).filter((u) => u !== 'at://x/3')).toEqual(['at://x/1', 'at://x/2']);
  });

  it('does not mutate its input array', () => {
    const input = [cached({ uri: 'at://x/1', ingredients: ['4 tomatoes'] })];
    const copy = [...input];
    applySeasonBoost(input, north);
    expect(input).toEqual(copy);
  });
});

describe('rankWithSeason — off is byte-identical (B-D6)', () => {
  it('with the setting off, output is deep-equal to the unboosted ranking', () => {
    const input = [
      cached({ uri: 'at://x/1', ingredients: ['4 tomatoes'] }),
      cached({ uri: 'at://x/2', ingredients: ['flour'] }),
    ];
    const off = rankWithSeason(input, { enabled: false, month: 7, region: 'northern-temperate' });
    expect(off).toEqual(input);
  });
});
