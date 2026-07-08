// Fetch candidate recipe images from Wikimedia Commons for the picker page
// (NON-PRODUCTION ops tooling). For each published recipe it searches Commons,
// keeps the top 3 photo results, downloads their 400px thumbnails, and records
// license + author + file-page URL so a chosen image can be attributed later.
//
//   node spike/import/fetch-images.mjs <out-dir>
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

// Wikimedia rate-limits bursts (HTTP 429). Serialize every request behind a
// minimum interval and back off (honoring Retry-After) on 429/503.
const MIN_INTERVAL_MS = 1200;
let lastRequest = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const politeFetch = async (url, headers) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequest);
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const res = await fetch(url, { headers });
    if (res.status !== 429 && res.status !== 503) return res;
    const retryAfter = Number(res.headers.get('retry-after'));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
    await sleep(backoff);
  }
  throw new Error('rate-limited after retries');
};

const DID = 'did:plc:spfl4xaktvvchr2cqp2r2xvp';
const SEED = 'Greek Cucumber Tomato Feta Salad';
const API = 'https://commons.wikimedia.org/w/api.php';
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: node fetch-images.mjs <out-dir>');
const IMG = `${OUT}/img`;
mkdirSync(IMG, { recursive: true });

// A recipe's display name isn't always the best image search. Strip decorative
// qualifiers and map a few to their base dish so Commons returns the food.
const OVERRIDE = {
  'Greek Chicken Souvlaki with Tzatziki': 'Souvlaki',
  'Crispy Baked Buffalo Wings': 'Buffalo wings',
  'Classic Meatloaf': 'Meatloaf',
  'Mac and Cheese': 'Macaroni and cheese',
  'Pozole Rojo': 'Pozole',
  'Beef Barbacoa': 'Barbacoa',
  'Chilaquiles Rojos': 'Chilaquiles',
  'Ground Beef Tacos': 'Taco',
  'Chicken Enchiladas': 'Enchilada',
  'Cheese Enchiladas': 'Enchilada',
};
const searchTerm = (name) =>
  OVERRIDE[name] ??
  name.replace(/^(Classic|Crispy|Baked|Easy|Simple|Homemade|Authentic|Truly)\s+/i, '').replace(/\s+with\s+.*/i, '').trim();

const stripHtml = (s) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '');

const searchImages = async (term) => {
  const url =
    `${API}?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(term)}` +
    `&gsrnamespace=6&gsrlimit=15&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiurlwidth=400`;
  const res = await politeFetch(url, { 'user-agent': 'arecipe-image-picker/0.1 (ops tooling)' });
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  const pages = Object.values((await res.json()).query?.pages ?? {});
  pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)); // preserve search relevance order
  const candidates = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (ii === undefined) continue;
    if (ii.mime !== 'image/jpeg' && ii.mime !== 'image/png') continue; // photos only, no svg/pdf
    if ((ii.width ?? 0) < 300) continue;
    const em = ii.extmetadata ?? {};
    candidates.push({
      title: p.title,
      thumburl: ii.thumburl,
      fullurl: ii.url,
      pageurl: ii.descriptionurl,
      width: ii.width,
      height: ii.height,
      license: em.LicenseShortName?.value ?? 'unknown',
      licenseUrl: em.LicenseUrl?.value ?? '',
      artist: stripHtml(em.Artist?.value) || 'unknown',
      attributionRequired: em.AttributionRequired?.value === 'true',
    });
    if (candidates.length === 3) break;
  }
  return candidates;
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const download = async (url, path) => {
  if (existsSync(path)) return; // idempotent: re-runs skip already-downloaded thumbs
  const res = await politeFetch(url, { 'user-agent': 'arecipe-image-picker/0.1 (ops tooling)' });
  if (!res.ok) throw new Error(`thumb HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
};

const listUrl = `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${DID}&collection=exchange.recipe.recipe&limit=100`;
const recs = (await (await fetch(listUrl)).json()).records
  .map((r) => ({ name: r.value.name, text: r.value.text, uri: r.uri }))
  .filter((r) => r.name !== SEED);

const catalog = [];
for (const rec of recs) {
  const term = searchTerm(rec.name);
  try {
    const found = await searchImages(term);
    const options = [];
    for (let i = 0; i < found.length; i += 1) {
      const c = found[i];
      const ext = c.mime === 'image/png' ? 'png' : 'jpg';
      const file = `${slug(rec.name)}-${i}.${ext}`;
      try {
        await download(c.thumburl, `${IMG}/${file}`);
        options.push({ ...c, file });
      } catch (e) {
        console.log('  thumb fail', rec.name, i, String(e.message));
      }
    }
    catalog.push({ ...rec, term, options });
    console.log(`${rec.name}  (term: "${term}") -> ${options.length} images`);
  } catch (e) {
    catalog.push({ ...rec, term, options: [] });
    console.log(`${rec.name}  (term: "${term}") -> FAILED ${String(e.message)}`);
  }
  await new Promise((r) => setTimeout(r, 400));
}

writeFileSync(`${OUT}/catalog.json`, JSON.stringify(catalog, null, 2));
const withImgs = catalog.filter((c) => c.options.length > 0).length;
console.log(`\n${withImgs}/${catalog.length} recipes have candidates -> ${OUT}/catalog.json`);
