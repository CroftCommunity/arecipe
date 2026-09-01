// D15 Phase 5 — nutrition. Maps the infobox `energy` field to nutrition.calories
// when parseable (kcal directly, or kJ→kcal ÷4.184). Conservative: an ambiguous
// or missing energy omits `nutrition` entirely (never {calories:0}). Only
// calories is derivable — fat/protein/carb are absent upstream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nutritionFor } from '../src/transform/enrich-nutrition.ts';
import { buildRecord, type RawMeta } from '../src/publish/record.ts';
import { transform } from '../src/transform/transform.ts';
import { loadConfig } from '../src/config.ts';

test('kcal parsed directly; kJ converted to kcal (÷4.184, rounded)', () => {
  assert.deepEqual(nutritionFor('250 kcal'), { calories: 250 });
  assert.deepEqual(nutritionFor('250 Calories'), { calories: 250 });
  assert.deepEqual(nutritionFor('1046 kJ'), { calories: 250 });
});

test('absence case: ambiguous/missing/non-numeric → undefined (not {calories:0})', () => {
  assert.equal(nutritionFor(''), undefined);
  assert.equal(nutritionFor('a lot'), undefined);
  assert.equal(nutritionFor('varies'), undefined);
  assert.equal(nutritionFor(undefined), undefined);
});

test('wiring: a recipe with parseable energy publishes nutrition; one without publishes none', () => {
  const cfg = loadConfig({ WIKIBOOKS_CONTACT: 'ops@arecipe.app' });
  const meta = (): RawMeta => ({ pageid: 1, title: 'Cookbook:X', revid: 1, revTimestamp: '2026-06-01T00:00:00Z', retrievedAt: '2026-07-23T00:00:00Z' });
  const withE = transform('{{Recipe summary|energy=250 kcal}}\nA dish.\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# Cook.', 'Cookbook:X');
  const noE = transform('A dish.\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# Cook.', 'Cookbook:X');
  assert.deepEqual(buildRecord(withE, meta(), cfg).record.nutrition, { calories: 250 });
  assert.equal('nutrition' in buildRecord(noE, meta(), cfg).record, false);
});
