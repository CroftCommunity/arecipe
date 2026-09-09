// Search by ingredient (plans/2026-08-12-1 Phase 3). Every recipe's ingredient
// lines resolve through the canonical vocabulary and the KEYS ride in the index
// beside the raw text — the raw text is never replaced, the canonical field only
// adds recall. Both directions work: a recipe that says "green onions" is found
// by "scallion" (the doc side carries the key), and a recipe that says
// "scallions" is found by "green onion" (a whole-query ingredient is resolved
// before searching). Unmatched lines contribute nothing — surfaced, never
// invented — and stay reachable by their raw words.
import { describe, expect, it } from 'vitest';
import { createRecipeSearch, searchDocOf } from '../../../src/recipes/search.js';
import type { CachedRecipe } from '../../../src/recipes/cache.js';

const cached = (name: string, ingredients: string[], rkey: string): CachedRecipe => ({
  uri: `at://did:plc:x/exchange.recipe.recipe/${rkey}`,
  cid: `cid-${rkey}`,
  value: { name, text: '', ingredients, instructions: [], createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:00:00Z' },
  verified: true,
  cachedAt: '2026-07-15T00:00:00Z',
});

const names = (entries: CachedRecipe[]): string[] => entries.map((e) => String(e.value['name']));

const feed = [
  cached('Scallion Pancakes', ['2 cups flour', '4 green onions, sliced', '1 tsp salt'], 'a'),
  cached('Miso Soup', ['4 cups dashi', '3 tbsp miso', '2 scallions, chopped'], 'b'),
  cached('Paprika Chicken', ['2 chicken thighs', '1 tbsp smoked paprika', '1 tsp salt'], 'c'),
  cached('Hummus', ['1 can chickpeas, drained', '2 tbsp tahini', 'juice of 1 lemon'], 'd'),
];

describe('searchDocOf — the canonical ingredientKeys field', () => {
  it('carries the resolved keys, first-seen order, de-duplicated, unmatched lines contributing nothing', () => {
    const doc = searchDocOf(cached('x', ['2 green onions, sliced', '1 tsp smoked paprika', '1 cup quuxwater', '3 scallions'], 'k'));
    expect(doc.ingredientKeys).toBe('scallion paprika');
  });

  it('reads a mistyped ingredients field as no keys rather than throwing', () => {
    expect(searchDocOf(cached('x', 42 as unknown as string[], 'k')).ingredientKeys).toBe('');
  });
});

describe('createRecipeSearch — reach through the vocabulary', () => {
  it('doc side: "scallion" finds the recipe that only says "green onions"', () => {
    expect(names(createRecipeSearch(feed).query('scallion'))).toEqual(expect.arrayContaining(['Scallion Pancakes', 'Miso Soup']));
  });

  it('query side: "green onion" finds the recipe that only says "scallions"', () => {
    expect(names(createRecipeSearch(feed).query('green onion'))).toContain('Miso Soup');
  });

  it('query side: an alias phrase ("garbanzo beans") finds the recipe that says "chickpeas"', () => {
    expect(names(createRecipeSearch(feed).query('garbanzo beans'))).toEqual(['Hummus']);
  });

  it('raw text is still indexed: a descriptor word ("smoked") and an unmatched ingredient ("dashi") stay reachable', () => {
    expect(names(createRecipeSearch(feed).query('smoked'))).toEqual(['Paprika Chicken']);
    expect(names(createRecipeSearch(feed).query('dashi'))).toEqual(['Miso Soup']);
  });

  it('a multi-term query keeps AND semantics and is not canonicalized as one ingredient', () => {
    expect(names(createRecipeSearch(feed).query('scallion salt'))).toEqual(['Scallion Pancakes']);
  });

  it('a query that resolves to a key still ranks a name hit first', () => {
    expect(names(createRecipeSearch(feed).query('scallion'))[0]).toBe('Scallion Pancakes');
  });
});

describe('index build cost band (Phase 0: +19% for the extra field at 4k records)', () => {
  it('builds the index over a 4,000-record census-shaped feed well inside a second on a dev machine', () => {
    const lines = ['2 cups flour', '1 tsp salt', '3 large eggs, beaten', '1 cup milk', '2 cloves garlic, minced', '1 tbsp olive oil', '1/2 tsp ground cumin', '1 onion, chopped'];
    const big = Array.from({ length: 4000 }, (_, i) => cached(`Recipe ${i}`, lines.map((l) => `${l} #${i % 7}`), `r${i}`));
    const t0 = performance.now();
    createRecipeSearch(big).query('salt');
    const ms = performance.now() - t0;
    console.log(`[search] 4k-record index build + first query: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(3000); // generous: CI runners are 2–3× slower than the measured 394 ms
  });
});
