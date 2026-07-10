// Attach the video's own frame to the published burrito-bowl recipe (NON-PRODUCTION ops
// tooling). uploadBlob the local frame, then putRecord with a single-image embed carrying the
// blob, alt text, aspect ratio, and credit. The credit's source is the video watch page, so the
// image credit (artist links to source) also points back at the video. Idempotent: skips if the
// record already has an embed. Reuses the unit-tested withImage transform from the import tooling.
//
//   node spike/video-transcript/attach-video-image.mjs --dry-run
//   node spike/video-transcript/attach-video-image.mjs
import { readFileSync } from 'node:fs';
import { withImage } from '../../spike/import/image-record.mjs';

const PDS = 'https://bsky.social';
const COLLECTION = 'exchange.recipe.recipe';
const MAX_BLOB = 1_000_000;
const DRY_RUN = process.argv.includes('--dry-run');
const root = new URL('../../', import.meta.url);
const here = new URL('.', import.meta.url);

const RECIPE_NAME = 'Lamb and Cilantro Stir Fry';
const WATCH_URL = 'https://video.infosec.exchange/w/b11bTRP1w2zptLaEPDggzJ';
const FRAME = new URL('out/frame.png', here);

const bytes = readFileSync(FRAME);
if (bytes.length > MAX_BLOB) throw new Error(`frame ${bytes.length} bytes exceeds ${MAX_BLOB} blob cap`);
const image = {
  bytes,
  mime: 'image/png',
  alt: 'A blue-and-white bowl of stir-fried lamb and cilantro held in one hand, with metal chopsticks resting on the rim.',
  aspectRatio: { width: 540, height: 540 },
  credit: { artist: 'I Live to Eat', license: 'video still', source: WATCH_URL },
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
const findRecord = async (did, name) => {
  let cursor;
  do {
    const u = new URL(`${PDS}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set('repo', did); u.searchParams.set('collection', COLLECTION); u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);
    const body = await (await fetch(u)).json();
    for (const r of body.records ?? []) if (r.value?.name === name) return { rkey: r.uri.split('/').pop(), value: r.value };
    cursor = body.cursor;
  } while (cursor);
  return null;
};
const uploadBlob = async (session, buf, mime) => {
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST', headers: { 'content-type': mime, authorization: `Bearer ${session.accessJwt}` }, body: buf,
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

if (DRY_RUN) {
  console.log(`frame: ${(bytes.length / 1024).toFixed(0)}KB ${image.mime} ${image.aspectRatio.width}x${image.aspectRatio.height}`);
  console.log('alt   :', image.alt);
  console.log('credit:', JSON.stringify(image.credit));
  console.log('DRY RUN: nothing uploaded or written.');
  process.exit(0);
}

const session = await login(readEnv());
console.log('signed in as', session.did);
const rec = await findRecord(session.did, RECIPE_NAME);
if (rec === null) throw new Error(`record not found: ${RECIPE_NAME}`);
if (rec.value.embed !== undefined) {
  console.log('skip (already has image):', RECIPE_NAME);
  process.exit(0);
}
const blob = await uploadBlob(session, bytes, image.mime);
const now = new Date().toISOString();
const updated = withImage(rec.value, { blob, alt: image.alt, aspectRatio: image.aspectRatio, credit: image.credit }, now);
const out = await putRecord(session, rec.rkey, updated);
console.log(`attached image to ${RECIPE_NAME} (${(bytes.length / 1024).toFixed(0)}KB) -> ${out.cid}`);
