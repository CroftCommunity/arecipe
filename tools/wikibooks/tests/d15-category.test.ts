// D15 Phase 3 — category crosswalk. Wikibooks infobox `category` + dish-type
// categories → a single controlled `category*` token (bare lowercase, as arecipe
// stores it, e.g. "dessert"). Precision-first: map only recognizable meal/dish
// types; leave unmapped (Phase 4 folds the original into keywords). Replaces the
// old free-text passthrough so faceting lines up with the live corpus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryToken } from '../src/transform/enrich-category.ts';
import { buildRecord, type RawMeta } from '../src/publish/record.ts';
import { transform } from '../src/transform/transform.ts';
import { loadConfig } from '../src/config.ts';

const irWith = (summaryLine: string, cats = ''): ReturnType<typeof transform> =>
  transform(`{{Recipe summary|${summaryLine}}}\nA dish.\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# Cook.\n${cats}`, 'Cookbook:X');

test('maps recognizable meal/dish types to the bare token', () => {
  assert.equal(categoryToken(irWith('category=Dessert recipes')), 'dessert');
  assert.equal(categoryToken(irWith('category=Soups')), 'soup');
  assert.equal(categoryToken(irWith('category=Appetizers')), 'appetizer');
  assert.equal(categoryToken(irWith('category=Salads')), 'salad');
  assert.equal(categoryToken(irWith('category=Breakfast')), 'breakfast');
});

test('reads dish-type from [[Category:…]] when the infobox has no meal type', () => {
  assert.equal(categoryToken(irWith('cuisine=Thai', '[[Category:Soup recipes]]')), 'soup');
});

test('negative: an ingredient/cuisine category yields no token (→ keyword spillover, Phase 4)', () => {
  assert.equal(categoryToken(irWith('category=Chicken recipes')), undefined);
  assert.equal(categoryToken(irWith('category=Ethiopian recipes')), undefined);
  assert.equal(categoryToken(irWith('')), undefined);
});

test('wiring: a Dessert recipe publishes recipeCategory=dessert; a Chicken one publishes no category token', () => {
  const cfg = loadConfig({ WIKIBOOKS_CONTACT: 'ops@arecipe.app' });
  const meta = (): RawMeta => ({ pageid: 1, title: 'Cookbook:X', revid: 1, revTimestamp: '2026-06-01T00:00:00Z', retrievedAt: '2026-07-23T00:00:00Z' });
  assert.equal(buildRecord(irWith('category=Dessert recipes'), meta(), cfg).record.recipeCategory, 'dessert');
  assert.equal('recipeCategory' in buildRecord(irWith('category=Chicken recipes'), meta(), cfg).record, false,
    'free-text category is no longer published as a token');
});
