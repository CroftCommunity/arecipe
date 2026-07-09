// Phase 6a: migrate the 41 live records — add `dishKey` (from dishkeys.json) +
// one best `funFacts[]` (the hand-researched pds-funfacts fact). Idempotent
// (putRecord overwrite; preserves createdAt, bumps updatedAt). One fact per
// dish per the publish decision.
//
//   node spike/import/migrate-live.mjs --dry-run   # preview, no writes
//   node spike/import/migrate-live.mjs             # apply to the 41 live records
import { readFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');
const PDS = 'https://bsky.social';
const COLLECTION = 'exchange.recipe.recipe';
const DID = 'did:plc:spfl4xaktvvchr2cqp2r2xvp';
const ENV = '/Users/cpettet/git/chasemp/CroftC/arecipe/.env';
const rd = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const env = Object.fromEntries(readFileSync(ENV, 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const dishkeys = rd('dishkeys.json').byRef;
const facts = rd('pds-funfacts.json').funFacts; // [{rkey,name,funFact}]

const call = async (method, body, jwt) => {
  const res = await fetch(`${PDS}/xrpc/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};

const s = (await call('com.atproto.server.createSession', { identifier: env.BSKY_ARECIPE_HANDLE, password: env.BSKY_ARECIPE_PASSWORD })).json;
if (!s.did) throw new Error(`login failed: ${s.error} ${s.message}`);

const list = await (await fetch(`${PDS}/xrpc/com.atproto.repo.listRecords?repo=${DID}&collection=${COLLECTION}&limit=100`)).json();
const records = list.records ?? [];
const now = new Date().toISOString();

let edited = 0;
let skipped = 0;
for (const r of records) {
  const rkey = r.uri.split('/').pop();
  const dishKey = dishkeys[r.uri];
  const prep = facts.find((f) => f.rkey === rkey);
  if (dishKey === undefined && prep === undefined) {
    skipped += 1;
    continue;
  }
  const value = { ...r.value };
  if (dishKey !== undefined) value.dishKey = dishKey;
  if (prep?.funFact) value.funFacts = [{ text: prep.funFact }];
  value.updatedAt = now;
  if (DRY) {
    console.log(`~ ${r.value.name} [${rkey}] dishKey=${dishKey ?? '-'} funFacts=${value.funFacts ? 1 : 0}`);
    edited += 1;
    continue;
  }
  const out = await call('com.atproto.repo.putRecord', { repo: DID, collection: COLLECTION, rkey, record: value }, s.accessJwt);
  if (out.json.uri) {
    console.log(`✓ ${r.value.name} → dishKey=${dishKey ?? '-'}`);
    edited += 1;
  } else {
    console.log(`✗ ${r.value.name}: ${out.json.error} ${out.json.message}`);
  }
}
console.log(`\n${DRY ? 'DRY RUN — ' : ''}${edited} edited, ${skipped} skipped, ${records.length} total`);

if (!DRY && edited > 0) {
  // Readback verify one.
  const sample = records[0];
  const back = await (await fetch(`${PDS}/xrpc/com.atproto.repo.getRecord?repo=${DID}&collection=${COLLECTION}&rkey=${sample.uri.split('/').pop()}`)).json();
  console.log(`\nreadback ${back.value.name}: dishKey=${back.value.dishKey ?? '-'} funFacts=${JSON.stringify(back.value.funFacts)?.slice(0, 80)}`);
}
