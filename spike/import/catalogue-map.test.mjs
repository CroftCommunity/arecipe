// TDD for the catalogue → exchange.recipe.recipe mapper (ops tooling, spike/).
// Run: node --test spike/import/catalogue-map.test.mjs
// Behaviors under test:
// - cuisineToken maps a catalogue category to the defs plain-word cuisine;
//   "Classics" is not a cuisine (undefined).
// - parseTimeToIso turns published human times into ISO-8601 durations,
//   dropping any "(plus marinating)" parenthetical; unusable → null.
// - classifyLabels splits catalogue labels into a single recipeCategory
//   (first meal-type label), diet token-refs, and leftover keywords.
// - mapEntry assembles a full record with $type, langs, attribution, and the
//   caller-supplied timestamps; Classics entries carry a "classic" keyword
//   and no recipeCuisine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cuisineToken,
  parseTimeToIso,
  classifyLabels,
  siteName,
  mapEntry,
} from './catalogue-map.mjs';

test('cuisineToken maps known cuisines to plain words; Classics is not a cuisine', () => {
  assert.equal(cuisineToken('Greek'), 'greek');
  assert.equal(cuisineToken('American'), 'american');
  assert.equal(cuisineToken('Thai'), 'thai');
  assert.equal(cuisineToken('Classics'), undefined);
});

test('parseTimeToIso converts human times, stripping parentheticals', () => {
  assert.equal(parseTimeToIso('15 min'), 'PT15M');
  assert.equal(parseTimeToIso('1 hr 10 min'), 'PT1H10M');
  assert.equal(parseTimeToIso('3 hr'), 'PT3H');
  assert.equal(parseTimeToIso('2 hr (plus marinating)'), 'PT2H');
  assert.equal(parseTimeToIso('15 min (plus soaking)'), 'PT15M');
  assert.equal(parseTimeToIso(''), null);
  assert.equal(parseTimeToIso(undefined), null);
});

test('classifyLabels separates meal category, diet tokens, and keywords', () => {
  const out = classifyLabels(['dinner', 'lunch', 'gluten-free', 'dairy-free']);
  assert.equal(out.category, 'dinner');
  assert.deepEqual(out.diet, ['exchange.recipe.defs#dietGlutenFree']);
  assert.deepEqual(out.keywords, ['lunch', 'dairy-free']);
});

test('classifyLabels maps vegetarian/vegan tokens and tolerates no meal label', () => {
  const out = classifyLabels(['vegan', 'vegetarian']);
  assert.equal(out.category, undefined);
  assert.deepEqual(out.diet, [
    'exchange.recipe.defs#dietVegan',
    'exchange.recipe.defs#dietVegetarian',
  ]);
  assert.deepEqual(out.keywords, []);
});

test('siteName resolves known publishers from a source URL', () => {
  assert.equal(siteName('https://hot-thai-kitchen.com/mango-sticky-rice/'), 'Hot Thai Kitchen');
  assert.equal(siteName('https://www.recipetineats.com/biryani/'), 'RecipeTin Eats');
  assert.equal(siteName('https://www.kingarthurbaking.com/recipes/apple-pie-recipe'), 'King Arthur Baking');
});

const MANGO = {
  name: 'Mango Sticky Rice',
  category: 'Thai',
  description: 'Warm glutinous rice in sweet-salty coconut milk with ripe mango.',
  ingredients: ['Thai glutinous (sticky) rice', 'Full-fat coconut milk'],
  instructions: ['Soak sticky rice, then steam.', 'Warm coconut milk with sugar and salt.'],
  labels: ['dessert', 'vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
  source_url: 'https://hot-thai-kitchen.com/mango-sticky-rice/',
  prep_time: '15 min (plus soaking)',
  cook_time: '30 min',
  total_time: '45 min',
  servings: '4',
};

test('mapEntry assembles a full record for a cuisine entry', () => {
  const now = '2026-07-08T00:00:00.000Z';
  const r = mapEntry(MANGO, now);
  assert.equal(r.$type, 'exchange.recipe.recipe');
  assert.equal(r.name, 'Mango Sticky Rice');
  assert.equal(r.text, MANGO.description);
  assert.deepEqual(r.ingredients, MANGO.ingredients);
  assert.deepEqual(r.instructions, MANGO.instructions);
  assert.equal(r.recipeCuisine, 'thai');
  assert.equal(r.recipeCategory, 'dessert');
  assert.deepEqual(r.suitableForDiet, [
    'exchange.recipe.defs#dietVegan',
    'exchange.recipe.defs#dietVegetarian',
    'exchange.recipe.defs#dietGlutenFree',
  ]);
  assert.ok(r.keywords.includes('dairy-free'));
  assert.ok(r.keywords.includes('plus soaking'));
  assert.equal(r.prepTime, 'PT15M');
  assert.equal(r.cookTime, 'PT30M');
  assert.equal(r.totalTime, 'PT45M');
  assert.equal(r.recipeYield, '4');
  assert.deepEqual(r.langs, ['en']);
  assert.equal(r.attribution.$type, 'exchange.recipe.defs#attributionWebsite');
  assert.equal(r.attribution.name, 'Hot Thai Kitchen');
  assert.equal(r.attribution.url, MANGO.source_url);
  assert.equal(r.createdAt, now);
  assert.equal(r.updatedAt, now);
});

test('mapEntry omits recipeCuisine and adds a classic keyword for Classics', () => {
  const applePie = {
    name: 'Apple Pie',
    category: 'Classics',
    description: 'A double-crust pie packed with cinnamon-spiced apples.',
    ingredients: ['Pie crust (double)', 'Baking apples, sliced'],
    instructions: ['Line a pie plate with the bottom crust.', 'Fill and bake.'],
    labels: ['dessert', 'vegetarian'],
    source_url: 'https://www.kingarthurbaking.com/recipes/apple-pie-recipe',
    prep_time: '45 min',
    cook_time: '1 hr',
    total_time: '2 hr',
    servings: '8',
  };
  const r = mapEntry(applePie, '2026-07-08T00:00:00.000Z');
  assert.equal(r.recipeCuisine, undefined);
  assert.ok(r.keywords.includes('classic'));
  assert.equal(r.recipeCategory, 'dessert');
  assert.deepEqual(r.suitableForDiet, ['exchange.recipe.defs#dietVegetarian']);
});
