// Wiring test (Phase 4c): the inline version flip on recipe.html. A recipe with
// sibling versions (sharing a dishKey) shows the ‹ N of M › bar above the detail;
// flipping swaps image/title/ingredients/instructions in place and updates the URL.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');
const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');

const AUTHOR_DID = 'did:plc:26tsx5juuss4yealylyfbj4h';
const AUTHOR_PDS = 'https://morel.us-east.host.bsky.network';

const routeVersions = async (page: Page): Promise<void> => {
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
    // getRecord → the first version (single record); listRecords → the group.
    if (route.request().url().includes('getRecord')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(versions.records[0]) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(versions) });
    }
  });
};

const VER1 = `at://${AUTHOR_DID}/exchange.recipe.recipe/ver1`;

test('a multi-version recipe shows the flip bar and swaps content in place', async ({ page }) => {
  await routeVersions(page);
  await page.goto(`/recipe.html?u=${encodeURIComponent(VER1)}&by=arecipe.bsky.social`);

  await expect(page.locator('h2')).toContainText('My Favorite Banana Bread', { timeout: 15_000 });
  await expect(page.getByTestId('version-bar')).toBeVisible();
  await expect(page.getByTestId('version-count')).toHaveText('1 of 2');
  await expect(page.getByTestId('view-all')).toHaveAttribute('href', /dish\.html\?key=banana-bread/);

  // Flip to the next version — title + ingredients swap in place.
  await page.getByTestId('version-next').click();
  await expect(page.locator('h2')).toContainText('Classic Moist Banana Bread');
  await expect(page.getByTestId('version-count')).toHaveText('2 of 2');
  await expect(page.getByTestId('recipe-ingredients')).toContainText('walnuts');
  // URL stays shareable — replaced to the shown version.
  await expect(page).toHaveURL(/u=at%3A%2F%2F.*ver2/);
});
