// D15 Phase 4 — keywords. From leftover [[Category:…]] (the "<X> recipes" base
// word), minus diet categories (already in suitableForDiet), minus the consumed
// category/cuisine tokens, minus Wikibooks maintenance/boilerplate categories.
// Each ≤64 chars, deduped, capped at 12, deterministic (first-seen order).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keywordsFor } from '../src/transform/enrich-keywords.ts';
import { buildRecord, type RawMeta } from '../src/publish/record.ts';
import { transform } from '../src/transform/transform.ts';
import { loadConfig } from '../src/config.ts';

const irCats = (...cats: string[]): ReturnType<typeof transform> =>
  transform(`A dish.\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# Cook.\n${cats.map((c) => `[[Category:${c}]]`).join('\n')}`, 'Cookbook:X');

test('keeps meaningful category base words, drops diet + maintenance categories', () => {
  const kw = keywordsFor(irCats('Ethiopian recipes', 'Vegan recipes', 'Stew recipes', 'Recipes using butter', 'Featured recipes'), []);
  assert.ok(kw.includes('ethiopian'));
  assert.ok(kw.includes('stew'));
  assert.ok(!kw.includes('vegan'), 'diet category is already suitableForDiet');
  assert.ok(!kw.some((k) => k.includes('butter') || k.includes('featured')), 'maintenance categories dropped');
});

test('excludes the consumed category/cuisine tokens (no redundant keyword)', () => {
  const kw = keywordsFor(irCats('Soup recipes', 'Thai recipes'), ['soup', 'thai']);
  assert.ok(!kw.includes('soup') && !kw.includes('thai'));
});

test('deduped, capped at 12, each ≤64 chars', () => {
  const many = Array.from({ length: 20 }, (_, i) => `Keyword${i} recipes`);
  const kw = keywordsFor(irCats(...many, ...many), []);
  assert.ok(kw.length <= 12);
  assert.equal(kw.length, new Set(kw).size);
  assert.ok(kw.every((k) => k.length <= 64));
});

test('wiring: a recipe publishes keywords; a diet/maintenance-only recipe publishes none', () => {
  const cfg = loadConfig({ WIKIBOOKS_CONTACT: 'ops@arecipe.app' });
  const meta = (): RawMeta => ({ pageid: 1, title: 'Cookbook:X', revid: 1, revTimestamp: '2026-06-01T00:00:00Z', retrievedAt: '2026-07-23T00:00:00Z' });
  assert.ok(buildRecord(irCats('Ethiopian recipes'), meta(), cfg).record.keywords?.includes('ethiopian'));
  assert.equal('keywords' in buildRecord(irCats('Vegan recipes', 'Featured recipes'), meta(), cfg).record, false);
});
