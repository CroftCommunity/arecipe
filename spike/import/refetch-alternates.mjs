// Round-2 image search (NON-PRODUCTION ops tooling): for recipes still unpicked
// in image-choices.json, fetch 3 DIFFERENT Commons candidates — excluding the
// titles already shown — and rewrite their catalog entry so a fresh picker page
// shows the new options.
//
//   node spike/import/refetch-alternates.mjs <dir>
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const DIR = process.argv[2];
if (!DIR) throw new Error('usage: node refetch-alternates.mjs <dir>');
const API = 'https://commons.wikimedia.org/w/api.php';
const IMG = `${DIR}/img`;
const UA = { 'user-agent': 'arecipe-image-picker/0.1 (ops tooling)' };

const MIN_INTERVAL_MS = 1200;
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const politeFetch = async (url) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const wait = MIN_INTERVAL_MS - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(url, { headers: UA });
    if (res.status !== 429 && res.status !== 503) return res;
    const ra = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt);
  }
  throw new Error('rate-limited after retries');
};
const stripHtml = (s) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const searchNew = async (term, exclude) => {
  const url =
    `${API}?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(term)}` +
    `&gsrnamespace=6&gsrlimit=40&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiurlwidth=400`;
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  const pages = Object.values((await res.json()).query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || (ii.mime !== 'image/jpeg' && ii.mime !== 'image/png')) continue;
    if ((ii.width ?? 0) < 300) continue;
    if (exclude.has(p.title)) continue; // the round-1 candidates
    const em = ii.extmetadata ?? {};
    out.push({
      title: p.title,
      thumburl: ii.thumburl,
      fullurl: ii.url,
      pageurl: ii.descriptionurl,
      width: ii.width,
      height: ii.height,
      mime: ii.mime,
      license: em.LicenseShortName?.value ?? 'unknown',
      licenseUrl: em.LicenseUrl?.value ?? '',
      artist: stripHtml(em.Artist?.value) || 'unknown',
      attributionRequired: em.AttributionRequired?.value === 'true',
    });
    if (out.length === 3) break;
  }
  return out;
};

const download = async (url, path) => {
  if (existsSync(path)) return;
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`thumb HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
};

const catalogPath = `${DIR}/catalog.json`;
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const chosen = new Set(Object.keys(JSON.parse(readFileSync(new URL('./image-choices.json', import.meta.url), 'utf8'))));
const targets = catalog.filter((c) => !chosen.has(c.name));
console.log('round-2 targets:', targets.map((t) => t.name).join(', '));

for (const rec of targets) {
  const exclude = new Set(rec.options.map((o) => o.title));
  try {
    const found = await searchNew(rec.term, exclude);
    const options = [];
    for (let i = 0; i < found.length; i += 1) {
      const c = found[i];
      const ext = c.mime === 'image/png' ? 'png' : 'jpg';
      const file = `${slug(rec.name)}-alt${i}.${ext}`;
      try {
        await download(c.thumburl, `${IMG}/${file}`);
        options.push({ ...c, file });
      } catch (e) {
        console.log('  thumb fail', rec.name, i, String(e.message));
      }
    }
    rec.options = options;
    rec.round = 2;
    console.log(`${rec.name} -> ${options.length} new images`);
  } catch (e) {
    console.log(`${rec.name} -> FAILED ${String(e.message)}`);
  }
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
}
console.log('done');
