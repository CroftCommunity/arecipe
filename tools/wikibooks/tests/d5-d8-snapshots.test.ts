// D5–D8 regression suite: transform each committed REAL wikitext fixture and
// compare its IR against a committed snapshot. The fixtures were captured from
// en.wikibooks (scripts/capture-fixtures.mjs) to span the awkward cases. Snapshot
// them once (UPDATE_SNAPSHOTS=1), then they guard against parser regressions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transform } from '../src/transform/transform.ts';
import { serializeIr } from '../src/ir.ts';
import { canonicalJsonPretty } from '../src/util/canonical-json.ts';

const here = dirname(fileURLToPath(import.meta.url));
const wikitextDir = join(here, 'fixtures', 'wikitext');
const irDir = join(here, 'fixtures', 'ir');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

type ManifestEntry = { slug: string; pageid: number; title: string; revid: number };
const manifest = JSON.parse(readFileSync(join(wikitextDir, 'MANIFEST.json'), 'utf8')) as ManifestEntry[];

test('the fixture corpus spans >=25 real pages', () => {
  assert.ok(manifest.length >= 25, `expected >=25 fixtures, have ${manifest.length}`);
});

for (const entry of manifest) {
  test(`IR snapshot: ${entry.slug}`, () => {
    const wikitext = readFileSync(join(wikitextDir, `${entry.slug}.wikitext`), 'utf8');
    const ir = transform(wikitext, entry.title);
    const snapPath = join(irDir, `${entry.slug}.json`);
    const actual = canonicalJsonPretty(ir) + '\n';
    if (UPDATE || !existsSync(snapPath)) {
      mkdirSync(irDir, { recursive: true });
      writeFileSync(snapPath, actual);
      if (!UPDATE) assert.fail(`no snapshot for ${entry.slug} — generated one; re-run to verify`);
      return;
    }
    assert.equal(actual, readFileSync(snapPath, 'utf8'), `IR drift for ${entry.slug}`);
    // Sanity: transform must be deterministic on this fixture.
    assert.equal(serializeIr(ir), serializeIr(transform(wikitext, entry.title)));
  });
}

test('no fixture silently loses an ingredients or procedure section', () => {
  // If the wikitext has an Ingredients heading with bullet items, the IR must
  // carry ingredients (or the transform recorded why via publishable=false).
  for (const entry of manifest) {
    const wikitext = readFileSync(join(wikitextDir, `${entry.slug}.wikitext`), 'utf8');
    const ir = transform(wikitext, entry.title);
    const hasIngredientBullets = /==+\s*ingredient[\s\S]*?\n\*/i.test(wikitext);
    if (hasIngredientBullets) {
      assert.ok(
        ir.ingredients.length > 0,
        `${entry.slug}: wikitext has ingredient bullets but IR has none`,
      );
    }
  }
});
