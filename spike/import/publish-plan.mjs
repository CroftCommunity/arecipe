// Phase 6 planner (recipe-model-extensions): compute the migration + publish
// plan WITHOUT writing. Shows exactly what a live run would do —
//   (a) 41 live-record edits: add dishKey + pooled funFacts[]
//   (b) N new imported records: dish→dishKey, funFact→funFacts[] (pooled per
//       dish across live+imported), versionLabel, dessert methods[] split into
//       sibling version records, image from image-choices-corpus (standin if none)
//
//   node spike/import/publish-plan.mjs            # dry-run report (no writes)
import { readFileSync } from 'node:fs';
import { normalizeDishKey } from './dishkeys.mjs';

const rd = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const FILES = ['own-batch', 'dessert-dual-method-25', 'regional-dishes-8', 'artisan-baking-28', 'frugal-family-25', 'julia-child-25'];
const DID = 'did:plc:spfl4xaktvvchr2cqp2r2xvp';

const dishkeys = rd('dishkeys.json').byRef;
const funfactsPrep = rd('pds-funfacts.json').funFacts; // [{rkey,name,funFact}]
const images = rd('image-choices-corpus.json');

// Imported records with their ref (file#index) → dishKey.
const imported = [];
for (const f of FILES) {
  const arr = rd(`${f}.json`);
  const rs = Array.isArray(arr) ? arr : arr.recipes ?? Object.values(arr);
  rs.forEach((r, i) => imported.push({ ...r, _ref: `${f}#${i}`, _src: f, dishKey: dishkeys[`${f}#${i}`] ?? normalizeDishKey(r.name) }));
}

const domain = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return undefined; } };

// Fetch live records (rkey + name) so we can map dishKey + apply funFacts.
const body = await (await fetch(`https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${DID}&collection=exchange.recipe.recipe&limit=100`)).json();
const live = (body.records ?? []).map((r) => {
  const rkey = r.uri.split('/').pop();
  const prep = funfactsPrep.find((x) => x.rkey === rkey);
  return { uri: r.uri, rkey, name: r.value.name, dishKey: dishkeys[r.uri] ?? normalizeDishKey(r.value.name), funFact: prep?.funFact };
});

// Pool funFacts per dishKey across live + imported, deduped by text.
const pool = new Map(); // dishKey → [{text, source?}]
const addFact = (key, text, source) => {
  if (!key || !text) return;
  const list = pool.get(key) ?? [];
  if (!list.some((f) => f.text === text)) list.push(source ? { text, source } : { text });
  pool.set(key, list);
};
for (const r of imported) addFact(r.dishKey, r.funFact, domain(r.reference?.url));
for (const r of live) addFact(r.dishKey, r.funFact, 'arecipe');

// Expand imported → publishable version records (dessert methods split).
const stripBase = (name, key) => name.replace(new RegExp(key.split('-').join('[ -]?'), 'i'), '').replace(/\s+/g, ' ').trim();
const newRecords = [];
for (const r of imported) {
  const hasImage = images[r.name] !== undefined;
  const base = { dishKey: r.dishKey, funFacts: pool.get(r.dishKey) ?? [], hasImage };
  if (Array.isArray(r.methods) && r.methods.length > 0) {
    for (const m of r.methods) newRecords.push({ ...base, name: r.name, versionLabel: m.label, instructions: m.steps?.length ?? 0, split: true });
  } else {
    const label = stripBase(r.name, r.dishKey) || r._src;
    newRecords.push({ ...base, name: r.name, versionLabel: label, instructions: (r.instructions ?? []).length, split: false });
  }
}

// Report.
const groups = new Map(); // dishKey → total version count (live + new records)
for (const r of live) groups.set(r.dishKey, (groups.get(r.dishKey) ?? 0) + 1);
for (const r of newRecords) groups.set(r.dishKey, (groups.get(r.dishKey) ?? 0) + 1);
const multi = [...groups.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);

console.log('=== PHASE 6 DRY RUN (no writes) ===\n');
console.log(`LIVE edits: ${live.length} records get dishKey + pooled funFacts`);
console.log(`  live with a fun fact staged: ${live.filter((r) => r.funFact).length}/${live.length}`);
console.log(`\nNEW records to publish: ${newRecords.length} (from ${imported.length} imported; +${newRecords.length - imported.length} from dessert method splits)`);
console.log(`  with a Commons image: ${newRecords.filter((r) => r.hasImage).length}; no-meal standin: ${newRecords.filter((r) => !r.hasImage).length}`);
console.log(`\nVERSION GROUPS (dishKey with >1 version across live + new): ${multi.length}`);
for (const [k, n] of multi) console.log(`  ${k} → ${n}`);
console.log(`\nfun-fact pools: ${[...pool.values()].filter((l) => l.length > 0).length} dishKeys have facts; largest pool = ${Math.max(0, ...[...pool.values()].map((l) => l.length))}`);
console.log('\n--- sample new record ---');
console.log(JSON.stringify(newRecords.find((r) => r.split) ?? newRecords[0], null, 2));
console.log('\n--- sample live edit ---');
const sampleLive = live.find((r) => (pool.get(r.dishKey) ?? []).length > 0) ?? live[0];
console.log(JSON.stringify({ rkey: sampleLive.rkey, name: sampleLive.name, dishKey: sampleLive.dishKey, funFacts: pool.get(sampleLive.dishKey) ?? [] }, null, 2));
console.log('\nDRY RUN complete — nothing written. Live publish awaits confirmation.');
