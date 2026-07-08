// Gather the live starter-feed recipes (all 4 starter authors) into a flat
// JSON for the browse-page mock (NON-PRODUCTION ops tooling). Pulls name,
// description, labels (cuisine/category/diet/keywords) and image info so the
// mock's filters and view modes run on real data.
//
//   node spike/import/gather-feed.mjs <out.json>
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: node gather-feed.mjs <out.json>');

const AUTHORS = [
  { handle: 'arecipe.bsky.social', did: 'did:plc:spfl4xaktvvchr2cqp2r2xvp' },
  { handle: 'rdur.dev', did: 'did:plc:26tsx5juuss4yealylyfbj4h' },
  { handle: 'recipe.exchange', did: 'did:plc:4cx7ts7lqgjtsfquo53qo3sz' },
  { handle: 'daffl.xyz', did: 'did:plc:vspq46f5zmrlesaszlyfliy2' },
];

const pdsOf = async (did) => {
  const doc = await (await fetch(`https://plc.directory/${did}`)).json();
  const svc = (doc.service ?? []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
  if (!svc) throw new Error(`no PDS for ${did}`);
  return svc.serviceEndpoint;
};

const listAll = async (pds, did) => {
  const out = [];
  let cursor;
  do {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set('repo', did);
    u.searchParams.set('collection', 'exchange.recipe.recipe');
    u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);
    const body = await (await fetch(u)).json();
    out.push(...(body.records ?? []));
    cursor = body.cursor;
  } while (cursor);
  return out;
};

const strip = (t) => (typeof t === 'string' ? t.split('#').pop() : t);

const recipes = [];
for (const a of AUTHORS) {
  try {
    const pds = await pdsOf(a.did);
    const records = await listAll(pds, a.did);
    for (const r of records) {
      const v = r.value;
      const img = v.embed?.images?.[0];
      const cid = img?.image?.ref?.$link ?? null;
      recipes.push({
        name: v.name,
        text: v.text ?? '',
        author: a.handle,
        did: a.did,
        cuisine: v.recipeCuisine ?? null,
        category: v.recipeCategory ?? null,
        diet: Array.isArray(v.suitableForDiet) ? v.suitableForDiet.map(strip) : [],
        keywords: Array.isArray(v.keywords) ? v.keywords : [],
        hasImage: cid !== null,
        imageUrl: cid ? `https://cdn.bsky.app/img/feed_thumbnail/plain/${a.did}/${cid}@jpeg` : null,
        totalTime: v.totalTime ?? null,
      });
    }
    console.log(`${a.handle}: ${records.length} recipes`);
  } catch (e) {
    console.log(`${a.handle}: FAILED ${String(e.message)}`);
  }
}

writeFileSync(OUT, JSON.stringify(recipes, null, 2));
const withImg = recipes.filter((r) => r.hasImage).length;
console.log(`\ntotal ${recipes.length} recipes (${withImg} with images) -> ${OUT}`);