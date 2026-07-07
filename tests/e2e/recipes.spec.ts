// Wiring tests: one action — a handle in, recipes out (resolve → public
// read → verified cache → cards). PDS resolution details are console
// diagnostics, not UI. Hermetic via recorded-fixture routes; the @live
// variant is the phase validation.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');
const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');

// The recorded author whose PDS the listRecords fixture came from.
const AUTHOR_DID = 'did:plc:26tsx5juuss4yealylyfbj4h';
const AUTHOR_PDS = 'https://morel.us-east.host.bsky.network';

const routeFixtures = async (page: Page): Promise<void> => {
  await page.route('https://public.api.bsky.app/**', async (route) => {
    const url = route.request().url();
    if (url.includes('resolveHandle') && url.includes('somechef')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ did: AUTHOR_DID }),
      });
    } else {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: identityFixture('resolveHandle-unresolvable.json'),
      });
    }
  });
  await page.route('https://plc.directory/**', async (route) => {
    const doc = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
      id: string;
      service: { serviceEndpoint: string }[];
    };
    doc.id = AUTHOR_DID;
    doc.service[0]!.serviceEndpoint = AUTHOR_PDS;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  await page.route(`${AUTHOR_PDS}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: atprotoFixture('listRecords-exchange.recipe.recipe.json'),
    });
  });
};

test('one action: handle in, verified recipe cards out (wiring)', async ({ page }) => {
  await routeFixtures(page);
  await page.goto('/');
  await page.getByTestId('handle-input').fill('somechef.example.com');
  await page.getByTestId('find-recipes').click();
  await expect(page.getByTestId('recipes-status')).toHaveText('3 recipes cached (3 verified)', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('recipe-item').first()).toContainText(
    'White Chocolate Strawberry Sourdough Sweet Bread',
  );
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
});

test('an unresolvable handle surfaces the failure in the status line', async ({ page }) => {
  await routeFixtures(page);
  await page.goto('/');
  await page.getByTestId('handle-input').fill('definitely-not-real-xyz9.bsky.social');
  await page.getByTestId('find-recipes').click();
  await expect(page.getByTestId('recipes-status')).toContainText('Unable to resolve handle');
});

test('the stamp explains itself on click (trust surface is legible)', async ({ page }) => {
  await routeFixtures(page);
  await page.goto('/');
  await page.getByTestId('handle-input').fill('somechef.example.com');
  await page.getByTestId('find-recipes').click();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
  await page.locator('.stamp').first().click();
  await expect(page.getByTestId('stamp-note').first()).toContainText(/hasn.t been altered/i);
});
