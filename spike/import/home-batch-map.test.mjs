// TDD for the home-batch → exchange.recipe.recipe mapper (ops tooling, spike/).
// Run: node --test spike/import/home-batch-map.test.mjs
// Behaviors under test:
// - homeEntryToRecord assembles a record with $type, name, text, ingredients,
//   instructions, langs, caller timestamps; person attribution becomes
//   #attributionPerson (name required, notes/url optional).
// - Optional fields (cuisine, category, times, yield, keywords, diet) are
//   OMITTED when empty/null — matching the lexicon's open-world floor.
// - Meta fields (id, image, confidence, notes, enhanced) never leak into the record.
// - hasPlaceholders flags bracketed "[…]" gaps; isPublishable gates on
//   high-confidence AND no placeholders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeEntryToRecord, hasPlaceholders, isPublishable } from './home-batch-map.mjs';

const NOW = '2026-07-10T00:00:00.000Z';
const base = () => ({
  id: 'x',
  image: 'preview/x.jpg',
  enhanced: 'enhanced/x.png',
  confidence: 'high',
  notes: 'some note',
  name: 'Test Recipe',
  text: 'A description.',
  ingredients: ['1 cup a', '2 cups b'],
  instructions: ['Step one.', 'Step two.'],
  recipeYield: '4',
  prepTime: null,
  cookTime: 'PT2M',
  totalTime: null,
  recipeCategory: 'dinner',
  recipeCuisine: 'american',
  keywords: ['weeknight'],
  suitableForDiet: ['exchange.recipe.defs#dietVegetarian'],
  attribution: { type: 'person', name: 'Grandma', notes: 'From a card.' },
});

test('assembles the required core fields, langs, and timestamps', () => {
  const r = homeEntryToRecord(base(), NOW);
  assert.equal(r.$type, 'exchange.recipe.recipe');
  assert.equal(r.name, 'Test Recipe');
  assert.equal(r.text, 'A description.');
  assert.deepEqual(r.ingredients, ['1 cup a', '2 cups b']);
  assert.deepEqual(r.instructions, ['Step one.', 'Step two.']);
  assert.deepEqual(r.langs, ['en']);
  assert.equal(r.createdAt, NOW);
  assert.equal(r.updatedAt, NOW);
});

test('maps person attribution to #attributionPerson (name + notes)', () => {
  const r = homeEntryToRecord(base(), NOW);
  assert.deepEqual(r.attribution, {
    $type: 'exchange.recipe.defs#attributionPerson',
    name: 'Grandma',
    notes: 'From a card.',
  });
});

test('omits attribution notes/url when absent', () => {
  const e = base();
  e.attribution = { type: 'person', name: 'Cadence' };
  const r = homeEntryToRecord(e, NOW);
  assert.deepEqual(r.attribution, {
    $type: 'exchange.recipe.defs#attributionPerson',
    name: 'Cadence',
  });
});

test('carries the optional fields when present', () => {
  const r = homeEntryToRecord(base(), NOW);
  assert.equal(r.recipeYield, '4');
  assert.equal(r.cookTime, 'PT2M');
  assert.equal(r.recipeCategory, 'dinner');
  assert.equal(r.recipeCuisine, 'american');
  assert.deepEqual(r.keywords, ['weeknight']);
  assert.deepEqual(r.suitableForDiet, ['exchange.recipe.defs#dietVegetarian']);
});

test('omits empty/null optional fields (open-world floor)', () => {
  const e = base();
  e.recipeYield = '';
  e.recipeCuisine = '';
  e.recipeCategory = '';
  e.cookTime = null;
  e.prepTime = null;
  e.totalTime = null;
  e.keywords = [];
  e.suitableForDiet = [];
  const r = homeEntryToRecord(e, NOW);
  for (const k of [
    'recipeYield',
    'recipeCuisine',
    'recipeCategory',
    'cookTime',
    'prepTime',
    'totalTime',
    'keywords',
    'suitableForDiet',
  ]) {
    assert.equal(k in r, false, `${k} should be omitted`);
  }
});

test('never leaks meta fields into the record', () => {
  const r = homeEntryToRecord(base(), NOW);
  for (const k of ['id', 'image', 'enhanced', 'confidence', 'notes', 'type']) {
    assert.equal(k in r, false, `${k} should not be in the record`);
  }
});

test('normalizes an unusable time to omitted', () => {
  const e = base();
  e.cookTime = 'not a duration';
  const r = homeEntryToRecord(e, NOW);
  assert.equal('cookTime' in r, false);
});

test('hasPlaceholders flags bracketed gaps in ingredients or instructions', () => {
  assert.equal(hasPlaceholders(base()), false);
  const e1 = base();
  e1.ingredients = ['ok', '[torn / illegible]'];
  assert.equal(hasPlaceholders(e1), true);
  const e2 = base();
  e2.instructions = ['[Continues on a missing second page]'];
  assert.equal(hasPlaceholders(e2), true);
});

test('isPublishable requires high confidence and no placeholders', () => {
  assert.equal(isPublishable(base()), true);
  const lo = base();
  lo.confidence = 'low';
  assert.equal(isPublishable(lo), false);
  const partial = base();
  partial.confidence = 'partial';
  assert.equal(isPublishable(partial), false);
  const gap = base();
  gap.ingredients = ['[missing]'];
  assert.equal(isPublishable(gap), false);
});
