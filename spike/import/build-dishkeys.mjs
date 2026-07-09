// Phase 1b: build the canonical dishKey mapping across all 177 records (136
// imported + 41 live) and print a REVIEW REPORT. Auto-propose → human review:
// this writes spike/import/dishkeys.json and prints the multi-version groups
// plus near-miss candidates for the user to confirm/edit before publish.
//
//   node spike/import/build-dishkeys.mjs            # write + report
//   node spike/import/build-dishkeys.mjs --dry-run  # report only, no write
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeDishKey, proposeGroups } from './dishkeys.mjs';

const DRY = process.argv.includes('--dry-run');
const DID = 'did:plc:spfl4xaktvvchr2cqp2r2xvp';
const FILES = ['own-batch', 'dessert-dual-method-25', 'regional-dishes-8', 'artisan-baking-28', 'frugal-family-25', 'julia-child-25'];

const records = [];
for (const f of FILES) {
  const arr = JSON.parse(readFileSync(new URL(`${f}.json`, import.meta.url), 'utf8'));
  const rs = Array.isArray(arr) ? arr : arr.recipes ?? Object.values(arr);
  rs.forEach((r, i) => records.push({ ref: `${f}#${i}`, name: r.name, src: f }));
}
// live records (single repo; paginate defensively)
let cursor;
do {
  const url = new URL('https://bsky.social/xrpc/com.atproto.repo.listRecords');
  url.searchParams.set('repo', DID);
  url.searchParams.set('collection', 'exchange.recipe.recipe');
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);
  const body = await (await fetch(url)).json();
  for (const r of body.records ?? []) records.push({ ref: r.uri, name: r.value.name, src: 'LIVE' });
  cursor = body.cursor;
} while (cursor);

const { byRef, groups } = proposeGroups(records);
const multi = Object.entries(groups).filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length);

// Near-miss candidates: a key K that starts with another key J + '-' might be a
// too-specific variant that should merge into J (e.g. caesar-salad-with-grilled-chicken → caesar-salad).
const keys = new Set(Object.keys(groups));
const nearMiss = [];
for (const k of keys) {
  for (const j of keys) {
    if (k !== j && k.startsWith(`${j}-`)) nearMiss.push({ specific: k, general: j });
  }
}

console.log(`records: ${records.length} · distinct dishKeys: ${Object.keys(groups).length} · multi-version groups: ${multi.length}\n`);
console.log('=== MULTI-VERSION GROUPS (confirm each is truly one dish) ===');
for (const [k, v] of multi) {
  console.log(`\n${k}  (${v.length})`);
  for (const r of v) console.log(`  - ${r.name} [${r.src}]`);
}
if (nearMiss.length > 0) {
  console.log('\n=== NEAR-MISS CANDIDATES (possible merges — your call) ===');
  for (const { specific, general } of nearMiss) {
    const sNames = groups[specific].map((r) => `${r.name} [${r.src}]`).join(', ');
    console.log(`  "${specific}" (${sNames})  ~?  "${general}"`);
  }
}

if (!DRY) {
  const out = {
    _meta: {
      purpose: 'Canonical dishKey per record (Phase 1b). Auto-proposed by build-dishkeys.mjs from recipe NAMES; REVIEW the groups before publish. Aliases/edits live in dishkeys.mjs ALIASES + this file.',
      records: records.length,
      distinctKeys: Object.keys(groups).length,
      multiVersionGroups: multi.length,
    },
    byRef,
    groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map((r) => ({ ref: r.ref, name: r.name, src: r.src }))])),
  };
  writeFileSync(new URL('dishkeys.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
  console.log('\nwrote spike/import/dishkeys.json');
} else {
  console.log('\nDRY RUN: nothing written.');
}
// silence unused-import lint in case normalizeDishKey isn't referenced directly
void normalizeDishKey;
