// RUN-RECIPE-META-STRIP D2/D3 acceptance (hermetic): the three-row meta strip
// (Serves · Time · Difficulty) hangs off the bottom of the recipe image, reads
// as one object with it, degrades to nothing, stands alone with no image, and
// suppresses difficulty in Focus mode (O2). Also proves the two measured
// acceptance criteria: the height budget (≤25% of the image at 390px) and the
// dot contrast on --tile. Mirrors recipe-share.spec's routed-fixture recipe page.
import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

const base = JSON.parse(
  readFileSync(new URL('../fixtures/atproto/getRecord-exchange.recipe.recipe.json', import.meta.url), 'utf8'),
) as { uri: string; cid: string; value: Record<string, unknown> };

const AUTHOR_DID = 'did:plc:26tsx5juuss4yealylyfbj4h';
const AUTHOR_PDS = 'https://morel.us-east.host.bsky.network';
const RECIPE_URI = base.uri;
const SHOTS = new URL('../../runs/recipe-meta-strip/shots/', import.meta.url).pathname;

// A 1×1 PNG so the image region shows a solid block (object-fit: cover) rather
// than the placeholder — keeps the attached-strip screenshots faithful.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type Meta = { serves?: string; time?: string; difficulty?: number; noImage?: boolean };

const buildValue = (m: Meta): Record<string, unknown> => {
  const value: Record<string, unknown> = { ...base.value };
  delete value['recipeYield'];
  delete value['totalTime'];
  delete value['prepTime'];
  delete value['difficulty'];
  if (m.serves !== undefined) value['recipeYield'] = m.serves;
  if (m.time !== undefined) value['totalTime'] = m.time;
  if (m.difficulty !== undefined) value['difficulty'] = m.difficulty;
  if (m.noImage === true) delete value['embed'];
  return value;
};

// The recipe page is cache-first (IndexedDB keyed by at-uri), so cases that
// share a context must use DISTINCT uris or the first record is re-served. Each
// case carries its own {uri, value}; the getRecord route echoes the requested
// rkey back as the record uri so the cache key matches.
type Case = { uri: string; value: Record<string, unknown> };

const rkeyOf = (url: string): string => new URL(url).searchParams.get('rkey') ?? '';

/** Route the cold-link read path; `current` supplies the case for each goto. */
const routeWith = async (page: Page, current: () => Case): Promise<void> => {
  await page.route('https://plc.directory/**', async (route) => {
    const doc = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
      id: string;
      service: { serviceEndpoint: string }[];
    };
    doc.id = AUTHOR_DID;
    doc.service[0]!.serviceEndpoint = AUTHOR_PDS;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  await page.route('https://cdn.bsky.app/**', async (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }),
  );
  await page.route(`${AUTHOR_PDS}/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('getRecord')) {
      const uri = `at://${AUTHOR_DID}/exchange.recipe.recipe/${rkeyOf(url)}`;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ uri, cid: base.cid, value: current().value }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
  });
};

const uriFor = (rkey: string): string => `at://${AUTHOR_DID}/exchange.recipe.recipe/${rkey}`;

const open = async (page: Page, uri: string = RECIPE_URI): Promise<void> => {
  await page.goto(`/recipe.html?u=${encodeURIComponent(uri)}&by=somechef.example.com`);
  await expect(page.locator('h2.recipe-title')).toBeVisible({ timeout: 15_000 });
};

test('all three rows render under the image, in order, with the display values', async ({ page }) => {
  const value = buildValue({ serves: '4', time: 'PT30M', difficulty: 3 });
  await routeWith(page, () => ({ uri: RECIPE_URI, value }));
  await open(page);

  const strip = page.getByTestId('meta-strip');
  await expect(strip).toBeVisible();
  await expect(strip.locator('.meta-row dt')).toHaveText(['Serves', 'Time', 'Difficulty']);
  await expect(strip.locator('.meta-row dd').nth(0)).toHaveText('4');
  await expect(strip.locator('.meta-row dd').nth(1)).toHaveText('30 m');
  await expect(strip.locator('.difficulty-label')).toHaveText('Average');
  // Dots are decoration; three are on, two off.
  await expect(strip.locator('.dots')).toHaveAttribute('aria-hidden', 'true');
  await expect(strip.locator('.dot--on')).toHaveCount(3);
  await expect(strip.locator('.dot--off')).toHaveCount(2);
  // Attached: the strip lives inside the clipped hero with the image.
  await expect(page.locator('.recipe-hero .meta-strip')).toHaveCount(1);
});

test('the strip degrades to nothing when no field is present (image keeps its corners)', async ({ page }) => {
  const value = buildValue({});
  await routeWith(page, () => ({ uri: RECIPE_URI, value }));
  await open(page);
  await expect(page.getByTestId('meta-strip')).toHaveCount(0);
  await expect(page.locator('.recipe-hero')).toHaveCount(0); // no empty container
});

test('with no image the strip stands alone, all corners rounded', async ({ page }) => {
  const value = buildValue({ serves: '4', time: 'PT30M', difficulty: 3, noImage: true });
  await routeWith(page, () => ({ uri: RECIPE_URI, value }));
  await open(page);
  const strip = page.getByTestId('meta-strip');
  await expect(strip).toHaveClass(/meta-strip--standalone/);
  await expect(page.locator('.recipe-hero')).toHaveCount(0); // not attached
  const radius = await strip.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  expect(parseFloat(radius)).toBeGreaterThan(0);
});

test('O2 — Focus mode keeps serves + time, suppresses difficulty', async ({ page }) => {
  const value = buildValue({ serves: '4', time: 'PT30M', difficulty: 3 });
  await routeWith(page, () => ({ uri: RECIPE_URI, value }));
  await open(page);
  await page.getByTestId('focus-btn').click();
  const strip = page.getByTestId('focus-view').getByTestId('meta-strip');
  await expect(strip).toBeVisible();
  await expect(strip.locator('.meta-row dt')).toHaveText(['Serves', 'Time']);
  await expect(strip.locator('.difficulty-label')).toHaveCount(0);
});

test('height budget: the strip is ≤25% of the image height at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const value = buildValue({ serves: '4', time: 'PT30M', difficulty: 3 });
  await routeWith(page, () => ({ uri: RECIPE_URI, value }));
  await open(page);
  const imgH = await page.locator('.recipe-hero .card-photo').evaluate((el) => el.getBoundingClientRect().height);
  const stripH = await page.getByTestId('meta-strip').evaluate((el) => el.getBoundingClientRect().height);
  const ratio = stripH / imgH;
  console.log(`[meta-strip] height budget: strip ${stripH.toFixed(1)}px / image ${imgH.toFixed(1)}px = ${(ratio * 100).toFixed(1)}%`);
  expect(ratio).toBeLessThanOrEqual(0.25);
});

test('contrast: difficulty dots on --tile are measured and non-text-safe', async ({ page }) => {
  const value = buildValue({ serves: '4', time: 'PT30M', difficulty: 3 });
  await routeWith(page, () => ({ uri: RECIPE_URI, value }));
  await open(page);
  const ratio = await page.getByTestId('meta-strip').evaluate((strip) => {
    const dot = strip.querySelector('.dot--on')!;
    const parse = (c: string): number[] => {
      const m = /rgba?\(([^)]+)\)/.exec(c)!;
      return m[1]!.split(',').map((x) => parseFloat(x));
    };
    const lin = (v: number): number => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const L = (rgb: number[]): number => 0.2126 * lin(rgb[0]!) + 0.7152 * lin(rgb[1]!) + 0.0722 * lin(rgb[2]!);
    const fg = L(parse(getComputedStyle(dot).backgroundColor));
    const bg = L(parse(getComputedStyle(strip).backgroundColor));
    const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
    return (hi + 0.05) / (lo + 0.05);
  });
  console.log(`[meta-strip] dot (--rust) on --tile contrast ratio = ${ratio.toFixed(2)}:1`);
  expect(ratio).toBeGreaterThanOrEqual(3); // WCAG non-text minimum
});

// Screenshots for the run summary: all eight presence combinations at 390 and
// 1280. The all-absent combo has no strip — its shot shows the image alone
// (normal corners), proving "an image with no strip keeps its corner treatment".
test('screenshots: eight presence combinations at 390 and 1280', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  let current: Case = { uri: RECIPE_URI, value: buildValue({}) };
  await routeWith(page, () => current);

  const combos: { name: string; meta: Meta }[] = [
    { name: '0-none', meta: {} },
    { name: '1-serves', meta: { serves: '4' } },
    { name: '2-time', meta: { time: 'PT30M' } },
    { name: '3-difficulty', meta: { difficulty: 3 } },
    { name: '4-serves-time', meta: { serves: '1-2', time: 'PT45M' } },
    { name: '5-serves-difficulty', meta: { serves: '4 burgers', difficulty: 4 } },
    { name: '6-time-difficulty', meta: { time: 'PT1H35M', difficulty: 2 } },
    { name: '7-all', meta: { serves: '4', time: 'PT30M', difficulty: 3 } },
  ];

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [i, { name, meta }] of combos.entries()) {
      // Distinct uri per combo (+width) so the cache-first page never re-serves
      // a prior combo's record.
      const uri = uriFor(`SHOT${width}C${i}`);
      current = { uri, value: buildValue(meta) };
      await open(page, uri);
      const target = (await page.locator('.recipe-hero').count()) > 0
        ? page.locator('.recipe-hero')
        : (await page.getByTestId('meta-strip').count()) > 0
          ? page.getByTestId('meta-strip')
          : page.locator('.photo-wrap--banner');
      await target.screenshot({ path: `${SHOTS}${name}-${width}.png` });
    }
  }

  // §5 — the no-image (standalone) case, shown explicitly.
  await page.setViewportSize({ width: 390, height: 900 });
  const noImgUri = uriFor('SHOTnoimg');
  current = { uri: noImgUri, value: buildValue({ serves: '4', time: 'PT30M', difficulty: 3, noImage: true }) };
  await open(page, noImgUri);
  await page.getByTestId('meta-strip').screenshot({ path: `${SHOTS}no-image-standalone-390.png` });

  // §5 — the Focus mode case (difficulty suppressed), shown explicitly.
  const focusUri = uriFor('SHOTfocus');
  current = { uri: focusUri, value: buildValue({ serves: '4', time: 'PT30M', difficulty: 3 }) };
  await open(page, focusUri);
  await page.getByTestId('focus-btn').click();
  await page.getByTestId('focus-view').getByTestId('meta-strip').screenshot({
    path: `${SHOTS}focus-mode-390.png`,
  });
});
