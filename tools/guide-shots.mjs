// Guide screenshots — regenerates assets/guide/*.png from the BUILT app.
//
//   npm run build && node tools/guide-shots.mjs
//
// Hermetic staging, same idea as the e2e specs: every network origin the app
// touches (plc.directory, the PDS, the image CDN) is routed to staged data, so
// the captures are reproducible and never depend on live accounts. Records are
// staged with REAL dag-cbor CIDs (mirroring src/recipes/cache.ts) so the app's
// integrity check passes and no screenshot carries an "ALTERED?" stamp.
//
// Dish photos are freely licensed images from Wikimedia Commons, fetched at
// run time by pinned file title (cached in $TMPDIR/arecipe-guide-shots). Each
// staged record carries the photo's artist/license/source in its image
// `credit`, so the app's own attribution overlay renders in the shots.
//
// Env: GUIDE_SHOTS_EXECUTABLE — Chromium path when the Playwright-pinned build
// isn't installed (e.g. /opt/pw-browsers/chromium-<build>/chrome-linux/chrome).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import * as dagCbor from '@ipld/dag-cbor';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import * as rawCodec from 'multiformats/codecs/raw';

const ORIGIN = 'http://127.0.0.1:4199';
const OUT = new URL('../assets/guide/', import.meta.url).pathname;
const CACHE = join(tmpdir(), 'arecipe-guide-shots');
const AUTHOR_DID = 'did:plc:spfl4xaktvvchr2cqp2r2xvp'; // arecipe.bsky.social (starter)
const AUTHOR_HANDLE = 'arecipe.bsky.social';
const PDS = 'https://pds0.test';
// The other starter cooks serve empty lists so the staged feed is exactly ours.
const OTHER_STARTERS = [
  'did:plc:26tsx5juuss4yealylyfbj4h',
  'did:plc:4cx7ts7lqgjtsfquo53qo3sz',
  'did:plc:vspq46f5zmrlesaszlyfliy2',
];

// ---------------------------------------------------------------------------
// Photos: pinned Commons files (all free licenses; credit rendered in-app).
const PHOTOS = {
  'greek-salad': {
    title: 'File:Greek Salad Choriatiki.jpg',
    artist: 'zone41 (Flickr)',
    license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Greek_Salad_Choriatiki.jpg',
  },
  pancakes: {
    title:
      "File:American Pancakes with banana and blueberries - Jonny's Goring Bar & Kitchen 2026-01-29.jpg",
    artist: 'Andy Li',
    license: 'CC0',
    source:
      'https://commons.wikimedia.org/wiki/File:American_Pancakes_with_banana_and_blueberries_-_Jonny%27s_Goring_Bar_%26_Kitchen_2026-01-29.jpg',
  },
  minestrone: {
    title: 'File:Minestrone soup.jpg',
    artist: 'Katrin Morenz',
    license: 'CC BY-SA 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Minestrone_soup.jpg',
  },
  'lunch-bowl': {
    title: 'File:Healthy Vegan Buddha Bowl - 49859044753.jpg',
    artist: 'FitTasteTic',
    license: 'CC BY-SA 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Healthy_Vegan_Buddha_Bowl_-_49859044753.jpg',
  },
};

const fetchPhoto = async (slug) => {
  const cached = join(CACHE, `${slug}.jpg`);
  if (existsSync(cached)) return readFileSync(cached);
  const api =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      format: 'json',
      titles: PHOTOS[slug].title,
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '800',
    });
  const meta = await (await fetch(api, { headers: { 'user-agent': 'arecipe-guide-shots/1.0' } })).json();
  const page = Object.values(meta.query.pages)[0];
  const thumb = page.imageinfo[0].thumburl;
  const bytes = Buffer.from(await (await fetch(thumb)).arrayBuffer());
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, bytes);
  return bytes;
};

// ---------------------------------------------------------------------------
// CIDs, mirroring src/recipes/cache.ts (record) and atproto blobs (raw).
const fromLexJson = (v) => {
  if (Array.isArray(v)) return v.map(fromLexJson);
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '$link') return CID.parse(v['$link']);
    return Object.fromEntries(keys.map((k) => [k, fromLexJson(v[k])]));
  }
  return v;
};
const recordCid = async (value) => {
  const hash = await sha256.digest(dagCbor.encode(fromLexJson(value)));
  return CID.createV1(dagCbor.code, hash).toString();
};
const blobCid = async (bytes) =>
  CID.createV1(rawCodec.code, await sha256.digest(bytes)).toString();

// ---------------------------------------------------------------------------
// Staged recipes: facts + own-words functional steps (demo records that exist
// only inside these screenshots).
const RECIPES = [
  {
    rkey: 'greeksalad', photo: 'greek-salad',
    name: 'Greek Salad (Horiátiki)',
    text: 'The Greek village salad — ripe tomatoes, cucumber, olives, and a slab of feta under good olive oil. No lettuce, no fuss.',
    cuisine: 'greek', category: 'dinner',
    diets: ['exchange.recipe.defs#dietVegetarian', 'exchange.recipe.defs#dietGlutenFree'],
    totalTime: 'PT15M',
    ingredients: ['4 ripe tomatoes, cut in wedges', '1 cucumber, thickly sliced', '1 small red onion, thinly sliced', '1 green bell pepper, in rings', '120 g feta, in one slab', 'a handful of Kalamata olives', '4 tbsp extra-virgin olive oil', '1 tsp dried oregano', 'sea salt'],
    instructions: ['Put the tomatoes, cucumber, onion, and pepper in a wide bowl and salt lightly.', 'Scatter the olives over and lay the feta on top in one piece.', 'Pour the olive oil over everything and dust with oregano.', 'Serve with bread for the juices — do not toss.'],
    funFacts: [{ text: 'Horiátiki means “village salad” — in Greece it is served without lettuce, and the feta goes on top in one slab, never crumbled.' }],
  },
  {
    rkey: 'pancakes', photo: 'pancakes',
    name: 'American Pancakes',
    text: 'Tall, fluffy weekend pancakes from one bowl — crisp edges, soft middles, made for maple syrup.',
    cuisine: 'american', category: 'breakfast',
    diets: ['exchange.recipe.defs#dietVegetarian'],
    totalTime: 'PT30M',
    ingredients: ['2 cups all-purpose flour', '2 tbsp sugar', '1 tbsp baking powder', '1/2 tsp salt', '1 3/4 cups milk', '2 eggs', '3 tbsp melted butter', 'maple syrup, to serve'],
    instructions: ['Whisk the dry ingredients together in a large bowl.', 'Whisk in the milk, eggs, and melted butter until just combined — small lumps are fine.', 'Cook ladlefuls on a buttered griddle over medium heat; flip when bubbles pop and stay open.', 'Serve hot in a stack with maple syrup.'],
    funFacts: [{ text: 'The bubbles that pop and hold their shape are the flip signal — flipping earlier deflates the cake.' }],
  },
  {
    rkey: 'minestrone', photo: 'minestrone',
    name: 'Italian Minestrone',
    text: 'A big, forgiving vegetable soup — beans, pasta, and whatever the garden gave you, simmered until friendly.',
    cuisine: 'italian', category: 'dinner',
    diets: ['exchange.recipe.defs#dietVegan'],
    totalTime: 'PT1H',
    ingredients: ['2 tbsp olive oil', '1 onion, diced', '2 carrots, diced', '2 celery stalks, diced', '2 garlic cloves, minced', '1 can (400 g) chopped tomatoes', '1 can (400 g) cannellini beans, drained', '1.2 l vegetable stock', '100 g small pasta', '2 handfuls chopped greens', 'salt and pepper'],
    instructions: ['Soften the onion, carrot, and celery in the oil; add the garlic for the last minute.', 'Add the tomatoes, beans, and stock and simmer 30 minutes.', 'Add the pasta and cook until tender, then wilt in the greens.', 'Season well and rest 10 minutes before serving.'],
  },
  {
    rkey: 'lunchbowl', photo: 'lunch-bowl',
    name: 'Vegan Lunch Bowl',
    text: 'A make-ahead grain bowl — quinoa, roast vegetables, chickpeas, and a lemon-tahini dressing.',
    cuisine: 'mediterranean', category: 'lunch',
    diets: ['exchange.recipe.defs#dietVegan', 'exchange.recipe.defs#dietGlutenFree'],
    totalTime: 'PT40M',
    ingredients: ['1 cup quinoa', '1 sweet potato, cubed', '1 can (400 g) chickpeas, drained', '2 handfuls baby spinach', '1 avocado, sliced', '3 tbsp tahini', '1 lemon, juiced', '1 small garlic clove, grated', 'olive oil, salt'],
    instructions: ['Cook the quinoa; roast the sweet potato and chickpeas with oil and salt at 200 °C for 25 minutes.', 'Whisk the tahini, lemon juice, garlic, and enough water to make a pourable dressing.', 'Bowl the quinoa, spinach, roast vegetables, and avocado.', 'Pour the dressing over just before eating.'],
  },
];

// ---------------------------------------------------------------------------
const buildStage = async () => {
  const photoBytes = {};
  for (const slug of Object.keys(PHOTOS)) photoBytes[slug] = await fetchPhoto(slug);

  const records = [];
  const byCid = {}; // blob cid → jpeg bytes, for the CDN route
  for (const r of RECIPES) {
    const bytes = photoBytes[r.photo];
    const bcid = await blobCid(bytes);
    byCid[bcid] = bytes;
    const p = PHOTOS[r.photo];
    const value = {
      $type: 'exchange.recipe.recipe',
      name: r.name,
      text: r.text,
      recipeCuisine: r.cuisine,
      recipeCategory: r.category,
      suitableForDiet: r.diets,
      totalTime: r.totalTime,
      ingredients: r.ingredients,
      instructions: r.instructions,
      ...(r.funFacts !== undefined ? { funFacts: r.funFacts } : {}),
      createdAt: '2026-07-01T09:00:00.000Z',
      updatedAt: '2026-07-01T09:00:00.000Z',
      embed: {
        $type: 'exchange.recipe.recipe#imagesEmbed',
        images: [{
          alt: r.name,
          image: { $type: 'blob', ref: { $link: bcid }, mimeType: 'image/jpeg', size: bytes.length },
          credit: { artist: p.artist, license: p.license, source: p.source },
        }],
      },
    };
    records.push({
      uri: `at://${AUTHOR_DID}/exchange.recipe.recipe/${r.rkey}`,
      cid: await recordCid(value),
      value,
    });
  }

  const salad = records[0];
  const comments = [
    {
      uri: `at://${AUTHOR_DID}/app.arecipe.comment/tip1`,
      value: {
        $type: 'app.arecipe.comment',
        recipe: { uri: salad.uri, cid: salad.cid },
        text: 'A tip from the taverna: salt the tomatoes ten minutes ahead so they release their juice into the oil.',
        createdAt: '2026-07-02T12:00:00.000Z',
      },
    },
  ];
  comments[0].cid = await recordCid(comments[0].value);
  const likes = [
    {
      uri: `at://${AUTHOR_DID}/app.arecipe.interaction/like1`,
      value: {
        $type: 'app.arecipe.interaction',
        kind: 'liked',
        recipe: { uri: salad.uri, cid: salad.cid },
        createdAt: '2026-07-03T12:00:00.000Z',
      },
    },
  ];
  likes[0].cid = await recordCid(likes[0].value);
  return { records, comments, likes, byCid, salad };
};

const didDoc = (did, pds, handle) => ({
  id: did,
  ...(handle !== undefined ? { alsoKnownAs: [`at://${handle}`] } : {}),
  service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: pds }],
});

const routeStage = async (page, stage) => {
  await page.route('https://plc.directory/**', (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    if (did === AUTHOR_DID) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(didDoc(did, PDS, AUTHOR_HANDLE)) });
    }
    if (OTHER_STARTERS.includes(did)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(didDoc(did, 'https://pds-empty.test')) });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
  await page.route('https://pds-empty.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) }),
  );
  await page.route(`${PDS}/**`, (route) => {
    const url = new URL(route.request().url());
    const collection = url.searchParams.get('collection');
    const rkey = url.searchParams.get('rkey');
    const pick = (list) => {
      if (rkey !== null) {
        const hit = list.find((r) => r.uri.endsWith(`/${rkey}`));
        return hit === undefined
          ? { status: 404, body: '{}' }
          : { status: 200, body: JSON.stringify(hit) };
      }
      return { status: 200, body: JSON.stringify({ records: list }) };
    };
    const lists = {
      'exchange.recipe.recipe': stage.records,
      'app.arecipe.comment': stage.comments,
      'app.arecipe.interaction': stage.likes,
    };
    const list = lists[collection] ?? [];
    const res = pick(list);
    return route.fulfill({ ...res, contentType: 'application/json' });
  });
  await page.route('https://cdn.bsky.app/**', (route) => {
    const m = route.request().url().match(/\/([a-z0-9]+)@jpeg$/);
    const bytes = m === null ? undefined : stage.byCid[m[1]];
    if (bytes === undefined) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: bytes });
  });
  await page.route('https://public.api.bsky.app/**', (route) => {
    const url = route.request().url();
    if (url.includes('resolveHandle') && url.includes(encodeURIComponent(AUTHOR_HANDLE))) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ did: AUTHOR_DID }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
};

// ---------------------------------------------------------------------------
const main = async () => {
  mkdirSync(OUT, { recursive: true });
  const stage = await buildStage();

  const root = new URL('..', import.meta.url).pathname;
  const server = spawn(join(root, 'node_modules', '.bin', 'esbuild'), ['--servedir=dist', '--serve=127.0.0.1:4199'], {
    cwd: root,
    // esbuild's --serve exits when its stdin closes; hold a pipe open so the
    // server outlives a detached parent stdin (CI, agent shells).
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  // Wait for the server; fail loud rather than screenshotting an error page.
  let up = false;
  for (let i = 0; i < 50 && !up; i += 1) {
    try {
      await fetch(ORIGIN);
      up = true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!up) throw new Error('dist server did not start on :4199 — run `npm run build` first?');

  const browser = await chromium.launch(
    process.env.GUIDE_SHOTS_EXECUTABLE !== undefined
      ? { executablePath: process.env.GUIDE_SHOTS_EXECUTABLE }
      : {},
  );
  const context = await browser.newContext({
    baseURL: ORIGIN,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  // Light theme, no SW surprises between shots.
  await context.addInitScript(() => localStorage.setItem('theme', 'light'));
  const page = await context.newPage();
  await routeStage(page, stage);
  const shot = (name) => join(OUT, `${name}.jpg`);
  const jpeg = { type: 'jpeg', quality: 85 };
  const settle = async () => {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400); // image paint
  };

  // 1) Browse — the default feed (tiles).
  await page.goto('/');
  await page.waitForSelector('[data-testid=recipe-item]');
  await settle();
  await page.screenshot({ path: shot('browse'), ...jpeg });
  console.log('✓ browse');

  // 2) Filters popover open, one facet ticked → honest count + reset.
  await page.locator('[data-testid=filters-dd] summary').click();
  await page.locator('input[data-dimension=category][data-value=dinner]').check();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('filters'), ...jpeg });
  console.log('✓ filters');

  // 3) Recipe detail (banner, credit, chips, ingredients-first columns).
  await page.goto(`/recipe.html?u=${encodeURIComponent(stage.salad.uri)}&by=${AUTHOR_HANDLE}`);
  await page.waitForSelector('.recipe-title');
  await settle();
  await page.screenshot({ path: shot('recipe'), ...jpeg });
  console.log('✓ recipe');

  // 3b) Comments block (element shot, scrolled into view).
  const comments = page.locator('section.comments');
  await page.waitForSelector('[data-testid=comment-item]', { timeout: 15_000 });
  await comments.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await comments.screenshot({ path: shot('comments'), ...jpeg });
  console.log('✓ comments');

  // 4) Focus mode.
  await page.locator('[data-testid=focus-btn]').click();
  await page.waitForSelector('[data-testid=focus-exit]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('focus'), ...jpeg });
  await page.keyboard.press('Escape');
  console.log('✓ focus');

  // 5) Kitchen References (static).
  await page.goto('/reference.html');
  await page.waitForSelector('h1');
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('reference'), ...jpeg });
  console.log('✓ reference');

  // 6) A shared cookbook, viewed cold (no sign-in).
  await page.goto(`/cookbook.html?did=${encodeURIComponent(AUTHOR_DID)}`);
  await page.waitForSelector('[data-testid=recipe-item]');
  await settle();
  await page.screenshot({ path: shot('cookbook'), ...jpeg });
  console.log('✓ cookbook');

  // 7) Meals planner: palette + a seeded, dated plan with meals placed.
  await context.addInitScript(
    ([palette, plans]) => {
      localStorage.setItem('arecipe.meals.palette-seed', palette);
      localStorage.setItem('arecipe.mealplans.v1', plans);
    },
    [
      JSON.stringify(
        RECIPES.map((r) => ({
          uri: `at://${AUTHOR_DID}/exchange.recipe.recipe/${r.rkey}`,
          cid: stage.records.find((rec) => rec.uri.endsWith(`/${r.rkey}`)).cid,
          name: r.name,
          cuisine: r.cuisine,
          category: r.category,
        })),
      ),
      JSON.stringify({
        'guide-plan': {
          id: 'guide-plan',
          name: 'My meal plan',
          mealsPerDay: 2,
          startDate: '2026-07-20',
          updatedAt: '2026-07-18T09:00:00.000Z',
          weeks: [
            {
              repeat: 1,
              days: [
                { meals: [mealOf('pancakes'), mealOf('greeksalad')] },
                { meals: [mealOf('lunchbowl')] },
                { meals: [mealOf('minestrone')] },
                { meals: [] },
                { meals: [mealOf('greeksalad')] },
                { meals: [mealOf('pancakes'), mealOf('minestrone')] },
                { meals: [] },
              ],
            },
          ],
        },
      }),
    ],
  );
  // The planner reads better a little wider than a phone; still one column.
  const mealsPage = await context.newPage();
  await mealsPage.setViewportSize({ width: 720, height: 900 });
  await routeStage(mealsPage, stage);
  await mealsPage.goto('/meals.html');
  await mealsPage.waitForSelector('[data-testid=builder]');
  await mealsPage.waitForTimeout(600);
  await mealsPage.screenshot({ path: shot('meals'), ...jpeg });
  console.log('✓ meals');

  // 8) Shopping list panel (Combined tab), element shot.
  await mealsPage.locator('[data-testid=shopping-list-open]').click();
  const panel = mealsPage.locator('[data-testid=shopping-list-panel]');
  await panel.waitFor();
  await mealsPage.locator('[data-testid=shopping-tab-combined]').click();
  await mealsPage.waitForTimeout(400);
  await panel.screenshot({ path: shot('shopping'), ...jpeg });
  console.log('✓ shopping');

  await browser.close();
  server.kill();
};

// Helper used inside the seeded plan above.
const mealsByRkey = Object.fromEntries(RECIPES.map((r) => [r.rkey, r]));
function mealOf(rkey) {
  const r = mealsByRkey[rkey];
  return {
    recipe: { uri: `at://${AUTHOR_DID}/exchange.recipe.recipe/${rkey}`, cid: 'staged', name: r.name },
    category: r.category,
  };
}

await main();
