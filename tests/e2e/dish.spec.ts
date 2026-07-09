// Wiring test (Phase 4b): dish.html?key=<dishKey>&did=<did> — the "View All"
// grid. Lists a dish's versions (records sharing the dishKey) as compare cards
// with pooled fun facts. Hermetic via recorded-fixture routes.
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
  await page.route(`${AUTHOR_PDS}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: atprotoFixture('listRecords-versions.json'),
    });
  });
};

test('dish.html lists a dish\'s versions as compare cards with pooled fun facts', async ({ page }) => {
  await routeVersions(page);
  await page.goto(`/dish.html?key=banana-bread&did=${AUTHOR_DID}&by=arecipe.bsky.social`);

  await expect(page.getByTestId('dish-title')).toHaveText('Banana Bread', { timeout: 15_000 });
  await expect(page.getByTestId('dish-count')).toContainText('2');
  await expect(page.getByTestId('version-card')).toHaveCount(2);
  // Primary version sorts first.
  await expect(page.getByTestId('version-card').first()).toContainText('My Favorite');
  // Pooled, deduped fun facts (2 unique across the 2 versions).
  await expect(page.getByTestId('fun-facts')).toBeVisible();
  await expect(page.getByTestId('fun-fact-count')).toHaveText('1 / 2');
});

test('a version card links to that version\'s recipe page', async ({ page }) => {
  await routeVersions(page);
  await page.goto(`/dish.html?key=banana-bread&did=${AUTHOR_DID}&by=arecipe.bsky.social`);
  await expect(page.getByTestId('version-card').first()).toHaveAttribute('href', /recipe\.html\?u=/, {
    timeout: 15_000,
  });
});

test('an unknown dishKey reports no versions found', async ({ page }) => {
  await routeVersions(page);
  await page.goto(`/dish.html?key=nonexistent-dish&did=${AUTHOR_DID}`);
  await expect(page.locator('.status')).toContainText('No versions found', { timeout: 15_000 });
});
