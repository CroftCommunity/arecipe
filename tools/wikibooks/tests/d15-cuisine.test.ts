// D15 Phase 3B — cuisine crosswalk. Wikibooks infobox `cuisine` + nationality
// [[Category:…]] → one controlled `cuisine*` token, bare lowercase ("american",
// "middle eastern"). Sparse by design: only the 33 defs cuisines map; a
// nationality with no token (e.g. Ethiopian) → undefined (→ keyword, Phase 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuisineToken } from '../src/transform/enrich-cuisine.ts';
import { buildRecord, type RawMeta } from '../src/publish/record.ts';
import { transform } from '../src/transform/transform.ts';
import { loadConfig } from '../src/config.ts';

const irWith = (summaryLine: string, cats = ''): ReturnType<typeof transform> =>
  transform(`{{Recipe summary|${summaryLine}}}\nA dish.\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# Cook.\n${cats}`, 'Cookbook:X');

test('maps infobox cuisine to the bare token', () => {
  assert.equal(cuisineToken(irWith('cuisine=Peruvian')), 'peruvian');
  assert.equal(cuisineToken(irWith('cuisine=Italian')), 'italian');
  assert.equal(cuisineToken(irWith('cuisine=Tex-Mex')), 'texmex');
  assert.equal(cuisineToken(irWith('cuisine=Middle Eastern')), 'middle eastern');
});

test('reads nationality from a [[Category:… recipes]] when the infobox lacks cuisine', () => {
  assert.equal(cuisineToken(irWith('category=Stews', '[[Category:Thai recipes]]')), 'thai');
});

test('negative: a nationality with no defs token, or nothing, yields undefined', () => {
  assert.equal(cuisineToken(irWith('cuisine=Ethiopian')), undefined);
  assert.equal(cuisineToken(irWith('category=Nigerian recipes')), undefined);
  assert.equal(cuisineToken(irWith('')), undefined);
});

test('wiring: a Peruvian recipe publishes recipeCuisine=peruvian; an Ethiopian one publishes none', () => {
  const cfg = loadConfig({ WIKIBOOKS_CONTACT: 'ops@arecipe.app' });
  const meta = (): RawMeta => ({ pageid: 1, title: 'Cookbook:X', revid: 1, revTimestamp: '2026-06-01T00:00:00Z', retrievedAt: '2026-07-23T00:00:00Z' });
  assert.equal(buildRecord(irWith('cuisine=Peruvian'), meta(), cfg).record.recipeCuisine, 'peruvian');
  assert.equal('recipeCuisine' in buildRecord(irWith('cuisine=Ethiopian'), meta(), cfg).record, false);
});
