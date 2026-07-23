// D9 — provenance + licence on every published record. Not a footer: structured
// fields (sourceUrl/permalink/revId/historyUrl/retrievedAt/license). O2: licence
// is config (default CC BY-SA 4.0); a missing licence blocks publish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecord, deterministicRkey, MissingLicenseError, type RawMeta } from '../src/publish/record.ts';
import { transform } from '../src/transform/transform.ts';
import { loadConfig } from '../src/config.ts';

const cfg = () => loadConfig({ WIKIBOOKS_CONTACT: 'ops@arecipe.app' });

const meta = (over: Partial<RawMeta> = {}): RawMeta => ({
  pageid: 1234,
  title: 'Cookbook:Ají de Gallina (Peruvian Chili Chicken)',
  revid: 987654,
  revTimestamp: '2026-06-01T00:00:00Z',
  retrievedAt: '2026-07-23T12:00:00Z',
  ...over,
});

const sampleIr = () =>
  transform(
    '{{Recipe summary| category = Chicken recipes|servings=4|time=45 minutes|difficulty=3|cuisine=Peruvian}}\nA Peruvian chili chicken stew that is rich and comforting.\n== Ingredients ==\n* [[Cookbook:Chicken|chicken]]\n== Procedure ==\n# Simmer.',
    'Cookbook:X',
  );

test('rkey is deterministic: wb-<pageid>, stable across a title change', () => {
  assert.equal(deterministicRkey(1234), 'wb-1234');
  const a = buildRecord(sampleIr(), meta({ title: 'Cookbook:Old Name' }), cfg());
  const b = buildRecord(sampleIr(), meta({ title: 'Cookbook:New Name' }), cfg());
  assert.equal(a.rkey, 'wb-1234');
  assert.equal(b.rkey, 'wb-1234', 'rename keeps the rkey → an update, not an orphan+create');
});

test('every record carries the full provenance block', () => {
  const { record } = buildRecord(sampleIr(), meta(), cfg());
  assert.equal(
    record.sourceUrl,
    'https://en.wikibooks.org/wiki/Cookbook:Aj%C3%AD_de_Gallina_(Peruvian_Chili_Chicken)',
  );
  assert.equal(record.sourcePermalink, 'https://en.wikibooks.org/w/index.php?oldid=987654');
  assert.equal(record.sourceRevId, 987654);
  assert.match(record.sourceHistoryUrl, /action=history/);
  assert.match(record.sourceHistoryUrl, /Aj%C3%AD/); // title encoded
  assert.equal(record.retrievedAt, '2026-07-23T12:00:00Z');
});

test('licence is present on every record (O2 default = CC BY-SA 4.0)', () => {
  const { record } = buildRecord(sampleIr(), meta(), cfg());
  assert.equal(record.license.id, 'CC-BY-SA-4.0');
  assert.equal(record.license.token, 'licenseCreativeCommonsBySa');
  assert.match(record.license.attribution, /Wikibooks Cookbook contributors/);
  // The attribution union also carries it (natural lexicon home).
  assert.equal(record.attribution?.name, 'Wikibooks Cookbook');
  assert.equal(record.attribution?.url, record.sourceUrl);
  assert.match(record.attribution?.notes ?? '', /CC BY-SA 4\.0/);
});

test('a missing licence config blocks record building (→ blocks publish)', () => {
  const noLicense = { ...cfg(), license: undefined };
  assert.throws(() => buildRecord(sampleIr(), meta(), noLicense), MissingLicenseError);
});

test('maps IR onto the consumed exchange.recipe.recipe shape', () => {
  const { record } = buildRecord(sampleIr(), meta(), cfg());
  assert.equal(record.$type, 'exchange.recipe.recipe');
  assert.equal(record.name, 'X');
  assert.ok(record.text.length > 0, 'description required + non-empty');
  assert.deepEqual(record.ingredients, ['chicken']);
  assert.deepEqual(record.instructions, ['Simmer.']);
  assert.equal(record.recipeCuisine, 'Peruvian');
  assert.equal(record.recipeCategory, 'Chicken recipes');
  assert.equal(record.totalTime, 'PT45M');
  // Fields with no lexicon home ride in the open-world `wikibooks` object.
  assert.equal(record.wikibooks.difficulty, 3);
  assert.equal(record.wikibooks.servings, '4');
  // createdAt/updatedAt are deterministic (wiki rev timestamp) → idempotent.
  assert.equal(record.updatedAt, '2026-06-01T00:00:00Z');
});

test('record building is deterministic', () => {
  const a = buildRecord(sampleIr(), meta(), cfg()).record;
  const b = buildRecord(sampleIr(), meta(), cfg()).record;
  assert.deepEqual(a, b);
});
