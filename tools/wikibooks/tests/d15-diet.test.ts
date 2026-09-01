// D15 Phase 2 — diet crosswalk. Wikibooks dietary [[Category:…]] links → the
// controlled exchange.recipe.defs#diet* refs arecipe facets on. Precision-first:
// only diet-category names (ending "recipes") map; ingredient/maintenance
// categories ("Recipes using gluten") do NOT. Built from the corpus histogram
// (Vegetarian/Vegan/Halal/gluten-free/Kosher are the only diet tokens present).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dietRefs } from '../src/transform/enrich-diet.ts';
import { buildRecord, type RawMeta } from '../src/publish/record.ts';
import { transform } from '../src/transform/transform.ts';
import { loadConfig } from '../src/config.ts';

test('maps each present diet category to the full defs ref', () => {
  assert.deepEqual(dietRefs(['Vegan recipes']), ['exchange.recipe.defs#dietVegan']);
  assert.deepEqual(dietRefs(['Vegetarian recipes']), ['exchange.recipe.defs#dietVegetarian']);
  assert.deepEqual(dietRefs(['Halal recipes']), ['exchange.recipe.defs#dietHalal']);
  assert.deepEqual(dietRefs(['Naturally gluten-free recipes']), ['exchange.recipe.defs#dietGlutenFree']);
  assert.deepEqual(dietRefs(['Kosher for Passover recipes']), ['exchange.recipe.defs#dietKosher']);
});

test('negative: non-diet and ingredient/maintenance categories map to nothing', () => {
  assert.deepEqual(dietRefs(['Dessert recipes']), []);
  assert.deepEqual(dietRefs(['Recipes using gluten']), [], 'a "using gluten" category is NOT gluten-free');
  assert.deepEqual(dietRefs(['Recipes using gluten-free flour']), [], 'ingredient category, not a diet claim');
  assert.deepEqual(dietRefs([]), []);
});

test('tolerates case, plural, and underscore variants', () => {
  assert.deepEqual(dietRefs(['vegan recipe']), ['exchange.recipe.defs#dietVegan']);
  assert.deepEqual(dietRefs(['Vegan_recipe']), ['exchange.recipe.defs#dietVegan']);
  assert.deepEqual(dietRefs(['Halal Recipe']), ['exchange.recipe.defs#dietHalal']);
});

test('multiple diet categories → deduped, deterministic (sorted) refs', () => {
  assert.deepEqual(dietRefs(['Vegetarian recipes', 'Halal recipes', 'Vegetarian recipes']), [
    'exchange.recipe.defs#dietHalal',
    'exchange.recipe.defs#dietVegetarian',
  ]);
});

test('wiring: a Vegan-category recipe publishes suitableForDiet; a plain one does not', () => {
  const cfg = loadConfig({ WIKIBOOKS_CONTACT: 'ops@arecipe.app' });
  const meta = (): RawMeta => ({ pageid: 1, title: 'Cookbook:X', revid: 1, revTimestamp: '2026-06-01T00:00:00Z', retrievedAt: '2026-07-23T00:00:00Z' });
  const irVegan = transform('A dish.\n== Ingredients ==\n* [[Cookbook:Tofu|tofu]]\n== Procedure ==\n# Cook.\n[[Category:Vegan recipes]]', 'Cookbook:X');
  const irPlain = transform('A dish.\n== Ingredients ==\n* [[Cookbook:Beef|beef]]\n== Procedure ==\n# Cook.', 'Cookbook:X');
  assert.deepEqual(buildRecord(irVegan, meta(), cfg).record.suitableForDiet, ['exchange.recipe.defs#dietVegan']);
  assert.equal('suitableForDiet' in buildRecord(irPlain, meta(), cfg).record, false);
});
