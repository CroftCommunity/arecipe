// Phase 5e wiring: the starter pack. A first-time visitor sees recipes with
// zero input; the pack is editable in settings; author names link to their
// Bluesky profiles. Hermetic via routed fixtures for all three authors.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');
const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

// Handles/DIDs must match src/recipes/starter.ts.
const AUTHORS = [
  { handle: 'arecipe.bsky.social', did: 'did:plc:spfl4xaktvvchr2cqp2r2xvp', pds: 'https://pds0.test' },
  { handle: 'rdur.dev', did: 'did:plc:26tsx5juuss4yealylyfbj4h', pds: 'https://pds1.test' },
  { handle: 'recipe.exchange', did: 'did:plc:4cx7ts7lqgjtsfquo53qo3sz', pds: 'https://pds2.test' },
  { handle: 'daffl.xyz', did: 'did:plc:vspq46f5zmrlesaszlyfliy2', pds: 'https://pds3.test' },
];

const routeStarterFixtures = async (page: Page): Promise<void> => {
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
  // Each fake PDS serves the recorded 3-recipe list, re-uri'd per author so
  // cards are distinct.
  for (const author of AUTHORS) {
    await page.route(`${author.pds}/**`, async (route) => {
      const list = JSON.parse(atprotoFixture('listRecords-exchange.recipe.recipe.json')) as {
        records: { uri: string }[];
      };
      for (const r of list.records) r.uri = r.uri.replace(/did:plc:[a-z0-9]+/, author.did);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) });
    });
  }
};

test('a first-time visitor sees starter-pack recipes with zero input (wiring)', async ({
  page,
}) => {
  await routeStarterFixtures(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(12); // 3 fixtures × 4 authors
  await expect(page.getByTestId('recipes-status')).toContainText('starter pack');
});

test('browse toolbar: count right-aligned, no "hidden" note, dietary-preference link (wiring)', async ({
  page,
}) => {
  await routeStarterFixtures(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  const status = page.getByTestId('recipes-status');
  await expect(status).toContainText('starter pack recipes');
  // The "· N hidden" note is dropped from the displayed string (Phase 1).
  await expect(status).not.toContainText('hidden');
  // The status lives in a toolbar, right-aligned inside a count block.
  await expect(page.locator('.browse-toolbar')).toBeVisible();
  await expect(page.locator('.browse-count')).toHaveCSS('text-align', 'right');
  // A "preference ↗" link points at the Settings dietary section.
  const dietLink = page.locator('.browse-toolbar a.diet-pref-link');
  await expect(dietLink).toHaveText(/preference/);
  await expect(dietLink).toHaveAttribute('href', './settings.html#diet-preference');
});

test('settings: starter rows link to Bluesky profiles and toggles persist', async ({ page }) => {
  await page.goto('/settings.html');
  const rows = page.getByTestId('starter-row');
  await expect(rows).toHaveCount(4);
  const link = rows.first().locator('a');
  await expect(link).toHaveAttribute('href', 'https://bsky.app/profile/arecipe.bsky.social');
  const box = rows.first().locator('input[type=checkbox]');
  await expect(box).toBeChecked();
  await box.uncheck();
  await page.reload();
  await expect(page.getByTestId('starter-row').first().locator('input[type=checkbox]')).not.toBeChecked();
});

test('a quick search is NOT clobbered by the slower starter feed (race)', async ({ page }) => {
  // Starter authors' PDSes respond slowly; the searched author responds fast.
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    service: { serviceEndpoint: string }[];
  };
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    const author = AUTHORS.find((a) => a.did === did);
    const target = author?.pds ?? 'https://searched.test';
    const doc = {
      ...template,
      id: did,
      service: [{ ...template.service[0]!, serviceEndpoint: target }],
    };
    if (author !== undefined) await new Promise((r) => setTimeout(r, 2_000)); // slow starter
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  for (const author of AUTHORS) {
    await page.route(`${author.pds}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: atprotoFixture('listRecords-exchange.recipe.recipe.json'),
      });
    });
  }
  await page.route('https://public.api.bsky.app/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ did: 'did:plc:searchedauthor123' }),
    }),
  );
  await page.route('https://searched.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: atprotoFixture('listRecords-exchange.recipe.recipe.json'),
    }),
  );

  await page.goto('/');
  // Search immediately, before the slow starter feed lands (D7: via "+ Cook").
  await page.getByTestId('add-cook').click();
  await page.getByTestId('add-cook-input').fill('somechef.example.com');
  await page.getByTestId('add-cook-submit').click();
  await expect(page.getByTestId('recipes-status')).toHaveText('3 recipes cached (3 verified)');
  // Wait past the starter feed's arrival: the search must still be showing.
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId('recipes-status')).toHaveText('3 recipes cached (3 verified)');
});

test('unchecking an author removes their cards from the default feed', async ({ page }) => {
  await routeStarterFixtures(page);
  await page.goto('/settings.html');
  await page.getByTestId('starter-row').first().locator('input[type=checkbox]').uncheck();
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(9); // one author off
});
