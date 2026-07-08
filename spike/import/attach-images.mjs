// Attach chosen Commons images to the recipe records (NON-PRODUCTION ops
// tooling). For each pick: resolve a <=1MB image via Commons, uploadBlob to
// the account's PDS, and putRecord with a single-image embed carrying the
// blob, alt text, aspect ratio, and image credit (artist/license/source).
// Idempotent: skips records that already have an embed.
//
//   node spike/import/attach-images.mjs --dry-run   # resolve + size-check, no writes
//   node spike/import/attach-images.mjs             # upload + attach
import { readFileSync } from 'node:fs';
import { fileTitleFromCommonsUrl, withImage } from './image-record.mjs';

const PDS = 'https://bsky.social';
const COLLECTION = 'exchange.recipe.recipe';
const API = 'https://commons.wikimedia.org/w/api.php';
const MAX_BLOB = 1_000_000; // exchange.recipe.recipe image blob maxSize
const WIDTH_LADDER = [1024, 800, 640, 512, 400, 320];
const DRY_RUN = process.argv.includes('--dry-run');
const root = new URL('../../', import.meta.url);
const UA = { 'user-agent': 'arecipe-image-attach/0.1 (ops tooling)' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCommons = 0;
const commonsFetch = async (url) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const wait = 1200 - (Date.now() - lastCommons);
    if (wait > 0) await sleep(wait);
    lastCommons = Date.now();
    const res = await fetch(url, { headers: UA });
    if (res.status !== 429 && res.status !== 503) return res;
    const ra = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt);
  }
  throw new Error('Commons rate-limited after retries');
};

// Resolve a pick to the largest thumbnail that fits under the blob cap.
const resolveImage = async (commonsUrl) => {
  const title = fileTitleFromCommonsUrl(commonsUrl);
  for (const width of WIDTH_LADDER) {
    const url =
      `${API}?action=query&format=json&titles=${encodeURIComponent(title)}` +
      `&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=${width}`;
    const body = await commonsFetch(url);
    if (!body.ok) throw new Error(`imageinfo HTTP ${body.status}`);
    const page = Object.values((await body.json()).query?.pages ?? {})[0];
    const ii = page?.imageinfo?.[0];
    if (ii?.thumburl === undefined) throw new Error('no imageinfo/thumburl');
    const imgRes = await commonsFetch(ii.thumburl);
    if (!imgRes.ok) throw new Error(`thumb HTTP ${imgRes.status}`);
    const bytes = Buffer.from(await imgRes.arrayBuffer());
    if (bytes.length <= MAX_BLOB) {
      return { bytes, mime: ii.mime, width: ii.thumbwidth, height: ii.thumbheight, atWidth: width };
    }
  }
  return null; // never got under the cap
};

const readEnv = () => {
  const env = Object.fromEntries(
    readFileSync(new URL('.env', root), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)),
  );
  if (!env.BSKY_ARECIPE_HANDLE || !env.BSKY_ARECIPE_PASSWORD) throw new Error('BSKY_ARECIPE_* missing from .env');
  return { handle: env.BSKY_ARECIPE_HANDLE, password: env.BSKY_ARECIPE_PASSWORD };
};
const login = async ({ handle, password }) => {
  const s = await (
    await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: handle, password }),
    })
  ).json();
  if (!s.did) throw new Error(`login failed: ${s.error} ${s.message}`);
  return s;
};
const listRecords = async (did) => {
  const map = new Map();
  let cursor;
  do {
    const u = new URL(`${PDS}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set('repo', did); u.searchParams.set('collection', COLLECTION); u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);
    const body = await (await fetch(u)).json();
    for (const r of body.records ?? []) map.set(r.value.name, { rkey: r.uri.split('/').pop(), value: r.value });
    cursor = body.cursor;
  } while (cursor);
  return map;
};
const uploadBlob = async (session, bytes, mime) => {
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST', headers: { 'content-type': mime, authorization: `Bearer ${session.accessJwt}` }, body: bytes,
  });
  const out = await res.json();
  if (!out.blob) throw new Error(`uploadBlob failed: ${out.error} ${out.message}`);
  return out.blob;
};
const putRecord = async (session, rkey, record) => {
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.putRecord`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessJwt}` },
    body: JSON.stringify({ repo: session.did, collection: COLLECTION, rkey, record }),
  });
  const out = await res.json();
  if (!out.uri) throw new Error(`putRecord failed: ${out.error} ${out.message}`);
  return out;
};

const choices = JSON.parse(readFileSync(new URL('spike/import/image-choices.json', root), 'utf8'));
const session = DRY_RUN ? null : await login(readEnv());
if (session) console.log('signed in as', session.did);
const records = DRY_RUN ? null : await listRecords(session.did);
const now = new Date().toISOString();

let done = 0;
let skipped = 0;
let failed = 0;
for (const [name, pick] of Object.entries(choices)) {
  const rec = records?.get(name);
  if (!DRY_RUN && rec === undefined) {
    console.log('MISSING record for', name);
    failed += 1;
    continue;
  }
  if (!DRY_RUN && rec.value.embed !== undefined) {
    console.log('skip (already has image):', name);
    skipped += 1;
    continue;
  }
  try {
    const img = await resolveImage(pick.commons);
    if (img === null) {
      console.log('TOO BIG (no width fit under 1MB):', name);
      failed += 1;
      continue;
    }
    const credit = { artist: pick.artist, license: pick.license, source: pick.commons };
    if (DRY_RUN) {
      console.log(`${name}: ${img.atWidth}px ${img.mime} ${(img.bytes.length / 1024).toFixed(0)}KB ${img.width}x${img.height} · ${pick.license} / ${pick.artist}`);
      done += 1;
      continue;
    }
    const blob = await uploadBlob(session, img.bytes, img.mime);
    const updated = withImage(rec.value, { blob, alt: name, aspectRatio: { width: img.width, height: img.height }, credit }, now);
    const out = await putRecord(session, rec.rkey, updated);
    console.log(`attached ${name} (${img.atWidth}px, ${(img.bytes.length / 1024).toFixed(0)}KB) -> ${out.cid}`);
    done += 1;
  } catch (e) {
    console.log('FAIL', name, String(e.message));
    failed += 1;
  }
}
console.log(`\n${DRY_RUN ? 'DRY RUN ' : ''}done: ${done} attached, ${skipped} skipped, ${failed} failed, ${Object.keys(choices).length} total`);
