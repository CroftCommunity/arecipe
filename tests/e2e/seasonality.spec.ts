// Feature B (seasonality) — the badge, the toggle, and the boost-only promise.
// Hermetic: the mixed feed (Greek Salad = cucumber/tomato/feta; American
// Pancakes = flour/milk/egg; Minestrone = tomato; Vegan Bowl = lemon) is routed
// as in browse.spec.ts. The clock is pinned to mid-July so tomato/cucumber are
// in season for the default Northern-temperate region and lemon is not.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');
const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

const AUTHORS = [
  { did: 'did:plc:spfl4xaktvvchr2cqp2r2xvp', pds: 'https://pds0.test', records: true },
  { did: 'did:plc:26tsx5juuss4yealylyfbj4h', pds: 'https://pds1.test', records: false },
  { did: 'did:plc:4cx7ts7lqgjtsfquo53qo3sz', pds: 'https://pds2.test', records: false },
  { did: 'did:plc:vspq46f5zmrlesaszlyfliy2', pds: 'https://pds3.test', records: false },
];

const routeMixedFeed = async (page: Page): Promise<void> => {
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
      const body = author.records
        ? atprotoFixture('listRecords-browse-mixed.json')
        : JSON.stringify({ records: [] });
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
  }
};

const JULY = new Date('2026-07-15T12:00:00Z');

test('the in-season badge appears on a matching card and not on a non-produce card', async ({
  page,
}) => {
  await page.clock.setFixedTime(JULY);
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible();

  // Greek Salad (tomato + cucumber) is in season in July, North → badged.
  const greek = page.getByTestId('recipe-item').filter({ hasText: 'Greek Salad' });
  await expect(greek.getByTestId('in-season-badge')).toBeVisible();

  // American Pancakes has no produce → never badged (boost only where relevant).
  const pancakes = page.getByTestId('recipe-item').filter({ hasText: 'American Pancakes' });
  await expect(pancakes.getByTestId('in-season-badge')).toHaveCount(0);
});

test('turning the setting off removes the badge and the strip (off = baseline)', async ({
  page,
}) => {
  await page.clock.setFixedTime(JULY);
  await routeMixedFeed(page);

  // On by default: at least one badge and the strip are present.
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible();
  expect(await page.getByTestId('in-season-badge').count()).toBeGreaterThan(0);
  await expect(page.getByTestId('in-season-strip')).toBeVisible();

  // Disable seasonality, reload: no badge, no strip anywhere.
  await page.addInitScript(() => localStorage.setItem('seasonality-enabled', '0'));
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible();
  await expect(page.getByTestId('in-season-badge')).toHaveCount(0);
  await expect(page.getByTestId('in-season-strip')).toHaveCount(0);
});

test('no copy anywhere states or implies anything is out of season', async ({ page }) => {
  await page.clock.setFixedTime(JULY);
  await routeMixedFeed(page);

  // The negative phrase-set seasonality must never emit (B4.5 / test 10).
  const forbidden = /out[ -]of[ -]season|not in season|poor month|off[ -]season|out of season/i;

  const pages = [
    '/', // Browse
    `/cookbook.html?did=${AUTHORS[0]!.did}`, // Cookbook (cold view)
    '/meals.html', // Meal planner (no seasonality surface by design)
  ];
  for (const url of pages) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const text = await page.evaluate(() => document.body.innerText);
    expect(text, `negative seasonality copy on ${url}`).not.toMatch(forbidden);
  }
});
