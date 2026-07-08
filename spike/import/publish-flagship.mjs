// Publish the 14 flagship recipes from assets/recipe_catalogue.md to the
// official application account (arecipe.bsky.social), the first entry in
// STARTER_AUTHORS — so they surface in Browse via the starter pack.
// NON-PRODUCTION ops tooling. Mapping is the unit-tested catalogue-map.mjs.
//
//   node spike/import/publish-flagship.mjs --dry-run   # preview, no writes
//   node spike/import/publish-flagship.mjs             # publish new entries
//
// Idempotent: skips any recipe whose name is already in the repo, so a
// re-run after a partial failure only creates what's missing. Reads
// credentials from the gitignored .env; never prints secrets.
import { readFileSync } from 'node:fs';
import { mapEntry } from './catalogue-map.mjs';

const PDS = 'https://bsky.social';
const COLLECTION = 'exchange.recipe.recipe';
const DRY_RUN = process.argv.includes('--dry-run');

const root = new URL('../../', import.meta.url);

const flagshipEntries = () => {
  const md = readFileSync(new URL('assets/recipe_catalogue.md', root), 'utf8');
  const block = /```json\s*([\s\S]*?)```/.exec(md);
  if (block === null) throw new Error('no ```json flagship block found in catalogue');
  const entries = JSON.parse(block[1]);
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('flagship block is empty');
  return entries;
};

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
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password }),
  });
  const session = await res.json();
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
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessJwt}` },
    body: JSON.stringify({ repo: session.did, collection: COLLECTION, record }),
  });
  const out = await res.json();
  if (!out.uri) throw new Error(`createRecord failed for "${record.name}": ${out.error} ${out.message}`);
  return out;
};

const now = new Date().toISOString();
const entries = flagshipEntries();
const records = entries.map((e) => mapEntry(e, now));
console.log(`mapped ${records.length} flagship recipes`);

if (DRY_RUN) {
  for (const r of records) {
    console.log(
      `- ${r.name} [${r.recipeCuisine ?? 'classic'}/${r.recipeCategory ?? '-'}] ` +
        `diet=${(r.suitableForDiet ?? []).map((d) => d.split('#')[1]).join(',') || '-'} ` +
        `times=${[r.prepTime, r.cookTime, r.totalTime].filter(Boolean).join('/')} ` +
        `yield=${r.recipeYield ?? '-'} src=${r.attribution.name}`,
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
