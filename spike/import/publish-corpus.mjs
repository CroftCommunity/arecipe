// Phase 6b: publish the 136-recipe corpus (161 version records after dessert
// method splits) to arecipe.bsky.social. Maps corpus fields → exchange.recipe.recipe,
// adds dishKey + versionLabel + one best funFacts[] per dish. Idempotent (skips
// by record name). Images attach separately (attach-corpus-images.mjs) — the
// records render with the no-meal standin until then.
//
//   node spike/import/publish-corpus.mjs --dry-run   # preview, no writes
//   node spike/import/publish-corpus.mjs             # publish
import { readFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');
const PDS = 'https://bsky.social';
const COLLECTION = 'exchange.recipe.recipe';
const DID = 'did:plc:spfl4xaktvvchr2cqp2r2xvp';
const ENV = '/Users/cpettet/git/chasemp/CroftC/arecipe/.env';
const rd = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const FILES = [
  ['own-batch', 'Everyday'],
  ['dessert-dual-method-25', 'Dessert'],
  ['regional-dishes-8', 'Regional'],
  ['artisan-baking-28', 'Artisan'],
  ['frugal-family-25', 'Frugal'],
  ['julia-child-25', 'Julia Child'],
];
const DIET = { vegetarian: 'dietVegetarian', 'gluten-free': 'dietGlutenFree', vegan: 'dietVegan', 'dairy-free': 'dietDairyFree', 'low-carb': 'dietLowCarb', keto: 'dietKeto', paleo: 'dietPaleo' };
const dietTokens = (arr) => (arr ?? []).map((d) => DIET[d]).filter(Boolean).map((t) => `exchange.recipe.defs#${t}`);

const dishkeys = rd('dishkeys.json').byRef;
const prep = rd('pds-funfacts.json').funFacts;

// bestFact per dishKey: prefer the hand-researched live fact, else first imported funFact.
const liveFactByKey = {};
for (const p of prep) {
  const key = dishkeys[`at://${DID}/${COLLECTION}/${p.rkey}`];
  if (key && p.funFact && liveFactByKey[key] === undefined) liveFactByKey[key] = p.funFact;
}
const importedFactByKey = {};

// Build version records.
const versions = [];
for (const [file, srcLabel] of FILES) {
  const arr = rd(`${file}.json`);
  const recipes = Array.isArray(arr) ? arr : arr.recipes ?? [];
  recipes.forEach((r, i) => {
    const dishKey = dishkeys[`${file}#${i}`];
    if (dishKey && r.funFact && importedFactByKey[dishKey] === undefined) importedFactByKey[dishKey] = r.funFact;
    if (Array.isArray(r.methods) && r.methods.length > 0) {
      for (const m of r.methods) versions.push({ base: r, dishKey, name: `${r.name} (${m.label})`, versionLabel: m.label, instructions: m.steps ?? [] });
    } else {
      versions.push({ base: r, dishKey, name: r.name, versionLabel: srcLabel, instructions: r.instructions ?? [] });
    }
  });
}
const bestFact = (key) => liveFactByKey[key] ?? importedFactByKey[key];

// Disambiguate identical names across versions (e.g. two "Boeuf Bourguignon")
// by suffixing the version label, so each published record has a unique name.
const nameCounts = versions.reduce((m, v) => m.set(v.name, (m.get(v.name) ?? 0) + 1), new Map());
for (const v of versions) if ((nameCounts.get(v.name) ?? 0) > 1) v.name = `${v.name} (${v.versionLabel})`;

const now = new Date().toISOString();
const toRecord = (v) => {
  const b = v.base;
  const rec = {
    $type: COLLECTION,
    name: v.name,
    text: b.description ?? '',
    ingredients: b.ingredients ?? [],
    instructions: v.instructions,
    createdAt: now,
    updatedAt: now,
  };
  if (b.serves) rec.recipeYield = String(b.serves);
  if (b.cuisine) rec.recipeCuisine = String(b.cuisine).toLowerCase();
  if (b.category) rec.recipeCategory = String(b.category).toLowerCase();
  const diet = dietTokens(b.diet);
  if (diet.length) rec.suitableForDiet = diet;
  if (Array.isArray(b.keywords) && b.keywords.length) rec.keywords = b.keywords;
  for (const t of ['prepTime', 'cookTime', 'totalTime']) if (b[t]) rec[t] = b[t];
  if (b.attribution?.type === 'website' && b.attribution.url) {
    rec.attribution = { $type: 'exchange.recipe.defs#attributionWebsite', name: b.attribution.name ?? 'source', url: b.attribution.url };
  }
  if (v.dishKey) rec.dishKey = v.dishKey;
  rec.versionLabel = v.versionLabel;
  const fact = bestFact(v.dishKey);
  if (fact) rec.funFacts = [{ text: fact }];
  return rec;
};

if (DRY) {
  console.log(`DRY RUN: ${versions.length} version records to publish`);
  console.log('sample:', JSON.stringify(toRecord(versions.find((v) => v.versionLabel === 'Microwave') ?? versions[0]), null, 2).slice(0, 900));
  const dupes = versions.map((v) => v.name).filter((n, i, a) => a.indexOf(n) !== i);
  console.log('duplicate names (should be none):', [...new Set(dupes)].join(', ') || '(none)');
  process.exit(0);
}

const env = Object.fromEntries(readFileSync(ENV, 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const s = await (await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: env.BSKY_ARECIPE_HANDLE, password: env.BSKY_ARECIPE_PASSWORD }) })).json();
if (!s.did) throw new Error(`login failed: ${s.error} ${s.message}`);

// Existing names (idempotency).
const existing = new Set();
let cursor;
do {
  const u = new URL(`${PDS}/xrpc/com.atproto.repo.listRecords`);
  u.searchParams.set('repo', DID); u.searchParams.set('collection', COLLECTION); u.searchParams.set('limit', '100');
  if (cursor) u.searchParams.set('cursor', cursor);
  const body = await (await fetch(u)).json();
  for (const r of body.records ?? []) existing.add(r.value.name);
  cursor = body.cursor;
} while (cursor);

let created = 0;
let skipped = 0;
let failed = 0;
for (const v of versions) {
  if (existing.has(v.name)) { skipped += 1; continue; }
  const out = await (await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.accessJwt}` },
    body: JSON.stringify({ repo: DID, collection: COLLECTION, record: toRecord(v) }),
  })).json();
  if (out.uri) { created += 1; if (created % 25 === 0) console.log(`  …${created} created`); }
  else { console.log(`✗ ${v.name}: ${out.error} ${out.message}`); failed += 1; }
}
console.log(`\ndone: ${created} created, ${skipped} skipped, ${failed} failed, ${versions.length} total`);
