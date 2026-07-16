// Mobile fit guard (mobile enhancement pass): at phone widths, no page should
// overflow horizontally — a horizontal scrollbar is the tell-tale of a rigid
// element (a wide table, a no-wrap row, a fixed-width control) breaking the
// layout. We measure documentElement scrollWidth vs clientWidth across the
// representative widths (320 small-Android/old-iPhone, 360 common-Android,
// 390 modern-iPhone) on pages that render without auth.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [320, 360, 390];

// A recipe detail needs a routed record to render; reuse the version fixtures.
const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');
const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');
const AUTHOR_DID = 'did:plc:26tsx5juuss4yealylyfbj4h';
const AUTHOR_PDS = 'https://morel.us-east.host.bsky.network';
const VER1 = `at://${AUTHOR_DID}/exchange.recipe.recipe/ver1`;

const routeRecipe = async (page: Page): Promise<void> => {
  await page.route('https://plc.directory/**', async (route) => {
    const doc = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
      id: string;
      service: { serviceEndpoint: string }[];
    };
    doc.id = AUTHOR_DID;
    doc.service[0]!.serviceEndpoint = AUTHOR_PDS;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  const versions = JSON.parse(atprotoFixture('listRecords-versions.json')) as {
    records: { uri: string; cid: string; value: unknown }[];
  };
  await page.route(`${AUTHOR_PDS}/**`, async (route) => {
    if (route.request().url().includes('getRecord')) {
      const r = versions.records[0]!;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ uri: r.uri, cid: r.cid, value: r.value }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(versions) });
    }
  });
};

const overflowOf = async (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const PAGES: { name: string; path: string; ready: string }[] = [
  { name: 'browse', path: '/index.html', ready: '[data-testid=recipe-search]' },
  { name: 'reference', path: '/reference.html', ready: 'section.ref-card' },
  { name: 'meals', path: '/meals.html', ready: '[data-testid=calendar]' },
  { name: 'settings', path: '/settings.html', ready: '[data-testid=release-pointer]' },
  { name: 'account', path: '/account.html', ready: '[data-testid=account-signed-out]' },
  { name: 'signin', path: '/signin.html', ready: 'form' },
  { name: 'editor', path: '/editor.html', ready: '[data-testid=editor-name]' },
  { name: 'alchemy', path: '/mine.html', ready: '[data-testid=new-recipe]' },
];

for (const width of WIDTHS) {
  for (const p of PAGES) {
    test(`no horizontal overflow: ${p.name} @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto(p.path);
      await page.locator(p.ready).first().waitFor({ timeout: 15_000 });
      expect(await overflowOf(page), `${p.name} @ ${width}px overflows`).toBeLessThanOrEqual(1);
    });
  }

  test(`no horizontal overflow: recipe detail @ ${width}px`, async ({ page }) => {
    await routeRecipe(page);
    await page.setViewportSize({ width, height: 780 });
    await page.goto(`/recipe.html?u=${encodeURIComponent(VER1)}&by=arecipe.bsky.social`);
    await page.locator('h2').first().waitFor({ timeout: 15_000 });
    expect(await overflowOf(page), `recipe @ ${width}px overflows`).toBeLessThanOrEqual(1);
  });
}

// Comfortable touch targets on a phone: interactive controls should be at least
// ~44px tall (WCAG 2.5.5). Representative controls across the chrome + toolbar.
test('tap targets are ≥44px on a phone (browse controls + bottom nav)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/index.html');
  await page.getByTestId('recipe-search').waitFor({ timeout: 15_000 });
  const ids = [
    'add-cook', // .button (opens the cook lookup panel)
    'export-recipes', // small icon .button
    'view-tiles', // .segmented-option
    'view-details',
    'theme-toggle', // .nav-gear (icon button)
    'nav-settings', // .nav-gear (icon link)
    'tab-browse', // bottom-nav .tab
  ];
  for (const id of ids) {
    const box = await page.getByTestId(id).first().boundingBox();
    expect(box, `${id} has a box`).not.toBeNull();
    expect(box!.height, `${id} tap height`).toBeGreaterThanOrEqual(44);
  }
});

// Reset-surface v2 (D6): the shared reset icon is icon-only, so its PADDED hit
// area (not a bigger glyph) must still clear 44px on a phone. The Browse reset
// only appears with a filter active, so route a hermetic feed and reveal it with
// a query; the Meals reset renders unconditionally.
const AUTHORS = [
  { did: 'did:plc:spfl4xaktvvchr2cqp2r2xvp', pds: 'https://pds0.test', records: true },
  { did: 'did:plc:26tsx5juuss4yealylyfbj4h', pds: 'https://pds1.test', records: false },
  { did: 'did:plc:4cx7ts7lqgjtsfquo53qo3sz', pds: 'https://pds2.test', records: false },
  { did: 'did:plc:vspq46f5zmrlesaszlyfliy2', pds: 'https://pds3.test', records: false },
];

const routeStarterFeed = async (page: Page): Promise<void> => {
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    service: { serviceEndpoint: string }[];
  };
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    const author = AUTHORS.find((a) => a.did === did);
    if (author === undefined) return route.fulfill({ status: 404, body: '{}' });
    const doc = { ...template, id: author.did, service: [{ ...template.service[0]!, serviceEndpoint: author.pds }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  for (const author of AUTHORS) {
    await page.route(`${author.pds}/**`, async (route) => {
      const body = author.records ? atprotoFixture('listRecords-browse-mixed.json') : JSON.stringify({ records: [] });
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
  }
};

test('tap target ≥44px on a phone (Browse reset, filter active)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await routeStarterFeed(page);
  await page.goto('/index.html');
  await page.getByTestId('recipe-item').first().waitFor({ timeout: 15_000 });
  await page.getByTestId('recipe-search').fill('salad');
  await expect(page.getByTestId('reset-filters')).toBeVisible();
  const box = await page.getByTestId('reset-filters').boundingBox();
  expect(box, 'reset-filters has a box').not.toBeNull();
  expect(box!.height, 'reset-filters tap height').toBeGreaterThanOrEqual(44);
});

test('tap target ≥44px on a phone (Meals reset)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/meals.html');
  const reset = page.getByTestId('reset-plan');
  await reset.waitFor({ timeout: 15_000 });
  const box = await reset.boundingBox();
  expect(box, 'reset-plan has a box').not.toBeNull();
  expect(box!.height, 'reset-plan tap height').toBeGreaterThanOrEqual(44);
});

// Signed releases: the Release & version panel's controls (both toggles + the
// migrated check-updates button) must be comfortable taps on a phone. The
// panel is device-local, so it renders signed-out — no auth needed.
test('tap targets ≥44px on a phone (Release & version panel)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/account.html');
  await page.getByTestId('release-panel').waitFor({ timeout: 15_000 });
  for (const id of ['version-pin', 'require-verified', 'check-updates']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, `${id} has a box`).not.toBeNull();
    expect(box!.height, `${id} tap height`).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width, `${id} fits the viewport`).toBeLessThanOrEqual(360);
  }
});
