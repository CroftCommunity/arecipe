// Publish the recipe drafted from the video transcript to the official
// application account (arecipe.bsky.social) so it surfaces on arecipe.app via the starter pack.
//
//   node spike/video-transcript/publish-video-recipe.mjs --dry-run   # preview, no writes
//   node spike/video-transcript/publish-video-recipe.mjs             # publish if not present
//
// Idempotent: skips if a record with this name already exists. Reads credentials from the
// gitignored .env at the repo root; never prints secrets. Mirrors spike/import/publish-flagship.mjs.
import { readFileSync } from 'node:fs';

const PDS = 'https://bsky.social';
const COLLECTION = 'exchange.recipe.recipe';
const DRY_RUN = process.argv.includes('--dry-run');
const root = new URL('../../', import.meta.url);

const WATCH_URL = 'https://video.infosec.exchange/w/b11bTRP1w2zptLaEPDggzJ';

const now = new Date().toISOString();
const record = {
  $type: COLLECTION,
  name: 'Lamb and Cilantro Stir Fry',
  text: 'Thin-sliced hot pot lamb stir-fried in a wok with a big handful of cilantro, garlic, and árbol chilies — a browning method built for a weak home stove. About 15 minutes start to finish; in Chicagoland the ingredients run about $13.83. Drafted from the source video.',
  ingredients: [
    'Thin-sliced hot pot lamb (freezer case at an Asian grocery)',
    'A big bunch of fresh cilantro',
    'Garlic',
    'Dried árbol chilies',
    'Cornstarch (helps the deglazing liquid become a sauce)',
    'Splash of rice wine (or water) to deglaze',
  ],
  instructions: [
    'If the hot pot lamb comes as a frozen box, let it defrost in the fridge and cook it the next day.',
    'Heat the wok. Spread the lamb in a single layer with the garlic and árbol chilies and let it brown undisturbed.',
    'Flip, let it sit another 30 seconds, and repeat — spread, brown, flip — until everything is nicely browned. This is the fix for a stove that isn’t that hot.',
    'Add the cilantro straight into the meat and fold it through until it just heats and wilts.',
    'Deglaze with a splash of rice wine or water; the cornstarch and the meat pull it into a light sauce.',
    'Start to finish, about 15 minutes. The same method works for beef and peppers, pork and leeks — whatever you fancy.',
  ],
  langs: ['en'],
  recipeCategory: 'dinner',
  recipeCuisine: 'chinese',
  keywords: ['stir fry', 'lamb', 'hot pot meat', 'wok', 'weeknight'],
  // Reference link back to the source video. $type is the schema-native video attribution
  // (exchange.recipe.defs#attributionShow: title/network/url); `name` is included so the
  // currently-deployed renderer (view.ts reads attribution.name + .url) draws the link.
  attribution: {
    $type: 'exchange.recipe.defs#attributionShow',
    title: 'Lamb and Cilantro Stir Fry',
    network: 'I Live to Eat',
    url: WATCH_URL,
    name: 'I Live to Eat (video.infosec.exchange)',
    notes: 'Recipe drafted from the video audio transcript (whisper.cpp base.en).',
  },
  createdAt: now,
  updatedAt: now,
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

const createRecord = async (session, rec) => {
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessJwt}` },
    body: JSON.stringify({ repo: session.did, collection: COLLECTION, record: rec }),
  });
  const out = await res.json();
  if (!out.uri) throw new Error(`createRecord failed: ${out.error} ${out.message}`);
  return out;
};

if (DRY_RUN) {
  console.log(JSON.stringify(record, null, 2));
  console.log(`\nreference link -> ${WATCH_URL}`);
  console.log('DRY RUN: nothing published.');
  process.exit(0);
}

const session = await login(readEnv());
console.log('signed in as', session.did);
const existing = await listExistingNames(session.did);
if (existing.has(record.name)) {
  console.log('skip (already published):', record.name);
  process.exit(0);
}
const out = await createRecord(session, record);
console.log('created:', record.name, '->', out.uri);
