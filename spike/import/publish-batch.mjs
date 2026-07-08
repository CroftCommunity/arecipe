// Publish the URL-batch recipes (authored prose + extracted facts) to the
// official application account. NON-PRODUCTION ops tooling; mapping is the
// unit-tested catalogue-map.mjs. Idempotent (skips names already published).
//
//   node spike/import/publish-batch.mjs --dry-run   # preview, no writes
//   node spike/import/publish-batch.mjs             # publish new entries
import { readFileSync } from 'node:fs';
import { mapEntry, cleanText } from './catalogue-map.mjs';
import { AUTHORED } from './batch-authored.mjs';

const PDS = 'https://bsky.social';
const COLLECTION = 'exchange.recipe.recipe';
const DRY_RUN = process.argv.includes('--dry-run');
const root = new URL('../../', import.meta.url);

const extracts = JSON.parse(readFileSync(new URL('spike/import/extracted-batch.json', root), 'utf8'));

const catalogueEntries = () =>
  Object.entries(AUTHORED).map(([name, a]) => {
    const e = extracts[name];
    if (e === undefined) throw new Error(`no extracted facts for "${name}"`);
    return {
      name,
      category: a.category,
      description: a.description,
      ingredients: e.ingredients.map(cleanText),
      instructions: a.instructions.map(cleanText),
      labels: a.labels,
      source_url: a.source_url,
      prep_time: e.prepTime,
      cook_time: e.cookTime,
      total_time: e.totalTime,
      servings: e.recipeYield,
    };
  });

const readEnv = () => {
  const env = Object.fromEntries(
    readFileSync(new URL('.env', root), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split(/=(.*)/s).slice(0, 2)),
  );
  const handle = env.BSKY_ARECIPE_HANDLE;
  const password = env.BSKY_ARECIPE_PASSWORD;
  if (!handle || !password) throw new Error('BSKY_ARECIPE_HANDLE / BSKY_ARECIPE_PASSWORD missing from .env');
  return { handle, password };
};

const login = async ({ handle, password }) => {
  const session = await (
    await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: handle, password }),
    })
  ).json();
  if (!session.did) throw new Error(`login failed: ${session.error} ${session.message}`);
  return session;
};

const listExistingNames = async (did) => {
  const names = new Set();
  let cursor;
  do {
    const url = new URL(`${PDS}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', COLLECTION);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const body = await (await fetch(url)).json();
    for (const r of body.records ?? []) if (r.value?.name) names.add(r.value.name);
    cursor = body.cursor;
  } while (cursor);
  return names;
};

const createRecord = async (session, record) => {
  const out = await (
    await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessJwt}` },
      body: JSON.stringify({ repo: session.did, collection: COLLECTION, record }),
    })
  ).json();
  if (!out.uri) throw new Error(`createRecord failed for "${record.name}": ${out.error} ${out.message}`);
  return out;
};

const now = new Date().toISOString();
const records = catalogueEntries().map((e) => mapEntry(e, now));
console.log(`mapped ${records.length} batch recipes`);

if (DRY_RUN) {
  for (const r of records) {
    console.log(
      `- ${r.name} [${r.recipeCuisine ?? 'classic'}/${r.recipeCategory ?? '-'}] ` +
        `diet=${(r.suitableForDiet ?? []).map((d) => d.split('#')[1]).join(',') || '-'} ` +
        `kw=${(r.keywords ?? []).join(',') || '-'} ` +
        `times=${[r.prepTime, r.cookTime, r.totalTime].filter(Boolean).join('/')} ` +
        `yield=${r.recipeYield ?? '-'} ings=${r.ingredients.length} steps=${r.instructions.length}`,
    );
  }
  console.log('\n--- full sample (first record) ---');
  console.log(JSON.stringify(records[0], null, 2));
  console.log('\nDRY RUN: nothing published.');
  process.exit(0);
}

const session = await login(readEnv());
console.log('signed in as', session.did);
const existing = await listExistingNames(session.did);

let created = 0;
let skipped = 0;
for (const record of records) {
  if (existing.has(record.name)) {
    console.log('skip (already published):', record.name);
    skipped += 1;
    continue;
  }
  const out = await createRecord(session, record);
  console.log('created:', record.name, '->', out.uri);
  created += 1;
}
console.log(`\ndone: ${created} created, ${skipped} skipped, ${records.length} total`);
