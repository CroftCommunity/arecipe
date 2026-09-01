// D15 Phase 10A — run summary enrichment counts. Tallies how many planned
// records carry each enriched field, so a run reports what it's publishing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichmentCounts } from '../src/run.ts';
import type { RecipeRecord } from '../src/publish/record.ts';
import type { PlanItem } from '../src/publish/publish.ts';

const rec = (over: Partial<RecipeRecord>): RecipeRecord => ({ $type: 'exchange.recipe.recipe', name: 'x', text: 't', ingredients: [], instructions: [], createdAt: '', updatedAt: '', sourceUrl: '', sourcePermalink: '', sourceRevId: 1, sourceHistoryUrl: '', retrievedAt: '', license: { id: '', token: '', attribution: '' }, wikibooks: { pageid: 1, parseFlags: [] }, ...over });
const create = (pageid: number, value: RecipeRecord): PlanItem => ({ action: 'create', pageid, rkey: `wb-${pageid}`, collection: 'exchange.recipe.recipe', value });

test('enrichmentCounts tallies field presence across create/update items only', () => {
  const items: PlanItem[] = [
    create(1, rec({ suitableForDiet: ['exchange.recipe.defs#dietVegan'], recipeCategory: 'dessert', keywords: ['a'], dishKey: 'k1' })),
    create(2, rec({ recipeCuisine: 'thai', nutrition: { calories: 200 }, cookingMethod: 'baking', dishKey: 'k2' })),
    create(3, rec({})),
    { action: 'delete', pageid: 4, rkey: 'wb-4', collection: 'exchange.recipe.recipe', reason: 'deleted' },
  ];
  const c = enrichmentCounts(items);
  assert.equal(c.diet, 1);
  assert.equal(c.recipeCategory, 1);
  assert.equal(c.recipeCuisine, 1);
  assert.equal(c.keywords, 1);
  assert.equal(c.nutrition, 1);
  assert.equal(c.cookingMethod, 1);
  assert.equal(c.dishKey, 2);
  assert.equal(c.embed, 0);
});
