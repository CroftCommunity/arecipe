// Phase 6c: attach Commons images to the published corpus records, keyed by
// the original recipe name (strips a trailing " (label)" version suffix so
// method/version-split records reuse the dish's image). Reuses the resolve →
// uploadBlob → embed path. Idempotent: skips records that already have an embed.
//
//   node spike/import/attach-corpus-images.mjs --dry-run   # resolve + size, no writes
//   node spike/import/attach-corpus-images.mjs             # upload + attach
import { readFileSync } from 'node:fs';
import { fileTitleFromCommonsUrl, withImage } from './image-record.mjs';

const DRY = process.argv.includes('--dry-run');
const PDS = 'https://bsky.social';
const COLLECTION = 'exchange.recipe.recipe';
const DID = 'did:plc:spfl4xaktvvchr2cqp2r2xvp';
const API = 'https://commons.wikimedia.org/w/api.php';
const MAX_BLOB = 1_000_000;
const WIDTH_LADDER = [1024, 800, 640, 512, 400, 320];
const ENV = '/Users/cpettet/git/chasemp/CroftC/arecipe/.env';
const UA = { 'user-agent': 'arecipe-image-attach/0.1 (ops tooling)' };
const choices = JSON.parse(readFileSync(new URL('image-choices-corpus.json', import.meta.url), 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
const commonsFetch = async (url) => {
  for (let a = 0; a < 6; a += 1) {
    const wait = 1200 - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(url, { headers: UA });
    if (res.status !== 429 && res.status !== 503) return res;
    const ra = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** a);
  }
  throw new Error('Commons rate-limited');
};
const resolveImage = async (commonsUrl) => {
  const title = fileTitleFromCommonsUrl(commonsUrl);
  for (const width of WIDTH_LADDER) {
    const body = await commonsFetch(`${API}?action=query&format=json&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=${width}`);
    if (!body.ok) throw new Error(`imageinfo HTTP ${body.status}`);
    const ii = Object.values((await body.json()).query?.pages ?? {})[0]?.imageinfo?.[0];
    if (ii?.thumburl === undefined) throw new Error('no thumburl');
    const imgRes = await commonsFetch(ii.thumburl);
    if (!imgRes.ok) throw new Error(`thumb HTTP ${imgRes.status}`);
    const bytes = Buffer.from(await imgRes.arrayBuffer());
    if (bytes.length <= MAX_BLOB) return { bytes, mime: ii.mime, width: ii.thumbwidth, height: ii.thumbheight, atWidth: width };
  }
  return null;
};
const call = async (method, body, jwt, raw) => {
  const res = await fetch(`${PDS}/xrpc/${method}`, { method: 'POST', headers: { 'content-type': raw ? body.mime : 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) }, body: raw ? body.bytes : JSON.stringify(body) });
  return res.json();
};

const origName = (name) => name.replace(/\s*\([^)]*\)\s*$/, '').trim();
const pickFor = (name) => choices[name] ?? choices[origName(name)];

const env = Object.fromEntries(readFileSync(ENV, 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const s = DRY ? null : await call('com.atproto.server.createSession', { identifier: env.BSKY_ARECIPE_HANDLE, password: env.BSKY_ARECIPE_PASSWORD });
if (!DRY && !s.did) throw new Error(`login failed: ${s.error} ${s.message}`);

const records = [];
let cursor;
do {
  const u = new URL(`${PDS}/xrpc/com.atproto.repo.listRecords`);
  u.searchParams.set('repo', DID); u.searchParams.set('collection', COLLECTION); u.searchParams.set('limit', '100');
  if (cursor) u.searchParams.set('cursor', cursor);
  const body = await (await fetch(u)).json();
  for (const r of body.records ?? []) records.push({ rkey: r.uri.split('/').pop(), value: r.value });
  cursor = body.cursor;
} while (cursor);

const now = new Date().toISOString();
let done = 0, skipped = 0, nopick = 0, failed = 0;
for (const rec of records) {
  if (rec.value.embed !== undefined) { skipped += 1; continue; }
  const pick = pickFor(rec.value.name);
  if (pick === undefined) { nopick += 1; continue; }
  try {
    const img = await resolveImage(pick.commons);
    if (img === null) { console.log('TOO BIG', rec.value.name); failed += 1; continue; }
    if (DRY) { console.log(`${rec.value.name}: ${img.atWidth}px ${(img.bytes.length / 1024) | 0}KB`); done += 1; continue; }
    const blob = (await call('com.atproto.repo.uploadBlob', { bytes: img.bytes, mime: img.mime }, s.accessJwt, true)).blob;
    const credit = { artist: pick.artist, license: pick.license, source: pick.commons };
    const updated = withImage(rec.value, { blob, alt: rec.value.name, aspectRatio: { width: img.width, height: img.height }, credit }, now);
    const out = await call('com.atproto.repo.putRecord', { repo: DID, collection: COLLECTION, rkey: rec.rkey, record: updated }, s.accessJwt);
    if (out.uri) { done += 1; if (done % 20 === 0) console.log(`  …${done} attached`); }
    else { console.log('✗', rec.value.name, out.error, out.message); failed += 1; }
  } catch (e) { console.log('FAIL', rec.value.name, String(e.message)); failed += 1; }
}
console.log(`\n${DRY ? 'DRY RUN ' : ''}done: ${done} attached, ${skipped} already had image, ${nopick} no pick (standin), ${failed} failed`);
