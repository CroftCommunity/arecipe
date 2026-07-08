// Record data hygiene: correct malformed metadata on records WE OWN
// (arecipe.bsky.social) so the raw data is clean, not just normalized at
// display time. NON-PRODUCTION ops tooling, matching the import scripts.
// Corrections: recipeCategory "side dish" → "side"; any suitableForDiet token
// with a doubled trailing "Diet" (dietGlutenFreeDiet) → stripped. Preserves
// createdAt, bumps updatedAt, idempotent. Foreign records we cannot edit
// (e.g. recipe.exchange's Gingerbread Cookies) are handled only by the
// display-time normalization in browse-state.ts — this script does not touch
// other accounts.
//
//   node spike/import/fix-metadata.mjs --dry-run   # preview, no writes
//   node spike/import/fix-metadata.mjs             # apply corrections
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PDS = 'https://bsky.social';
const COLLECTION = 'exchange.recipe.recipe';
const root = new URL('../../', import.meta.url);

/**
 * Pure: correct one record's `value`. Returns the (possibly) corrected value
 * and whether anything changed. `updatedAt` is bumped to `nowIso` only when a
 * correction was made, so re-running is a no-op (idempotent).
 */
export const correctRecordValue = (value, nowIso) => {
  let changed = false;
  const next = { ...value };
  if (next.recipeCategory === 'side dish') {
    next.recipeCategory = 'side';
    changed = true;
  }
  if (Array.isArray(next.suitableForDiet)) {
    const corrected = next.suitableForDiet.map((token) =>
      typeof token === 'string' && token.endsWith('Diet') ? token.slice(0, -'Diet'.length) : token,
    );
    if (corrected.some((token, i) => token !== next.suitableForDiet[i])) {
      next.suitableForDiet = corrected;
      changed = true;
    }
  }
  if (changed && nowIso !== undefined) next.updatedAt = nowIso;
  return { value: next, changed };
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
  if (!handle || !password) {
    throw new Error('BSKY_ARECIPE_HANDLE / BSKY_ARECIPE_PASSWORD missing from .env');
  }
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

const listRecords = async (did) => {
  const records = [];
  let cursor;
  do {
    const url = new URL(`${PDS}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', COLLECTION);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const body = await (await fetch(url)).json();
    for (const r of body.records ?? []) records.push({ uri: r.uri, value: r.value });
    cursor = body.cursor;
  } while (cursor);
  return records;
};

const putRecord = async (session, rkey, record) => {
  const out = await (
    await fetch(`${PDS}/xrpc/com.atproto.repo.putRecord`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessJwt}` },
      body: JSON.stringify({ repo: session.did, collection: COLLECTION, rkey, record }),
    })
  ).json();
  if (!out.uri) throw new Error(`putRecord failed for ${rkey}: ${out.error} ${out.message}`);
  return out;
};

const main = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const now = new Date().toISOString();
  const session = await login(readEnv());
  console.log('signed in as', session.did);
  const records = await listRecords(session.did);
  const corrections = [];
  for (const r of records) {
    const { value, changed } = correctRecordValue(r.value, now);
    if (changed) corrections.push({ rkey: r.uri.split('/').pop(), before: r.value, after: value });
  }
  console.log(`scanned ${records.length} records; ${corrections.length} need correction`);
  for (const c of corrections) {
    console.log(
      `- ${c.rkey}: category ${c.before.recipeCategory ?? '-'} → ${c.after.recipeCategory ?? '-'}; ` +
        `diet ${JSON.stringify(c.before.suitableForDiet ?? [])} → ${JSON.stringify(c.after.suitableForDiet ?? [])}`,
    );
    if (!dryRun) {
      await putRecord(session, c.rkey, c.after);
      console.log(`  put ${c.rkey}`);
    }
  }
  console.log(dryRun ? '\nDRY RUN: nothing written.' : `\nwrote ${corrections.length} corrections.`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
