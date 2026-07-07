// Phase 4a wiring test: entry point → resolve → public read → verified
// cache, surfaced in the shell. Hermetic: resolver + PDS served from the
// recorded D2 fixtures via route interception. The @live variant (real PDS,
// real recipe.exchange author) is the phase validation.
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ did: AUTHOR_DID }),
    });
  });
  await page.route('https://plc.directory/**', async (route) => {
    // Point the recorded DID doc's PDS at the fixture author's PDS.
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

test('resolve → load recipes → verified cache count in the shell (wiring)', async ({ page }) => {
  await routeFixtures(page);
  await page.goto('/');
  await page.getByTestId('handle-input').fill('somechef.example.com');
  await page.getByTestId('resolve-submit').click();
  await expect(page.getByTestId('resolved-pds')).toHaveText(`PDS: ${AUTHOR_PDS}`);

  await page.getByTestId('load-recipes').click();
  await expect(page.getByTestId('recipes-status')).toHaveText('3 recipes cached (3 verified)', {
    timeout: 15_000,
  });
});
