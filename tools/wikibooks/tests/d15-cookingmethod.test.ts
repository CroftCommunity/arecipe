// D15 Phase 5B — cookingMethod. A single bare-lowercase method token inferred
// from the title/categories, PRECISION-FIRST: stamp only on an unambiguous
// keyword; omit when absent, ambiguous, or conflicting. No upstream method
// field exists, so recall is deliberately low.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cookingMethodFor } from '../src/transform/enrich-cookingmethod.ts';
import { buildRecord, type RawMeta } from '../src/publish/record.ts';
import { transform } from '../src/transform/transform.ts';
import { loadConfig } from '../src/config.ts';

const ir = (title: string, ...cats: string[]): ReturnType<typeof transform> =>
  transform(`A dish.\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# Cook.\n${cats.map((c) => `[[Category:${c}]]`).join('\n')}`, `Cookbook:${title}`);

test('maps an unambiguous method keyword in the title', () => {
  assert.equal(cookingMethodFor(ir('Baked Ziti')), 'baking');
  assert.equal(cookingMethodFor(ir('Grilled Cheese Sandwich')), 'grilling');
  assert.equal(cookingMethodFor(ir('Deep-Fried Turkey')), 'frying');
  assert.equal(cookingMethodFor(ir('Slow Cooker Beef Stew')), 'slowcooking');
});

test('"no-bake" is nocook, not baking (conflict word handled)', () => {
  assert.equal(cookingMethodFor(ir('No-Bake Cookies')), 'nocook');
});

test('omit when absent, or when two methods conflict', () => {
  assert.equal(cookingMethodFor(ir('Pancakes')), undefined);
  assert.equal(cookingMethodFor(ir('Grilled and Fried Sampler')), undefined, 'two methods → ambiguous → omit');
});

test('wiring: a Baked recipe publishes cookingMethod=baking; a plain one publishes none', () => {
  const cfg = loadConfig({ WIKIBOOKS_CONTACT: 'ops@arecipe.app' });
  const meta = (): RawMeta => ({ pageid: 1, title: 'Cookbook:Baked Ziti', revid: 1, revTimestamp: '2026-06-01T00:00:00Z', retrievedAt: '2026-07-23T00:00:00Z' });
  assert.equal(buildRecord(ir('Baked Ziti'), meta(), cfg).record.cookingMethod, 'baking');
  const plainMeta = (): RawMeta => ({ ...meta(), title: 'Cookbook:Pancakes' });
  assert.equal('cookingMethod' in buildRecord(ir('Pancakes'), plainMeta(), cfg).record, false);
});
