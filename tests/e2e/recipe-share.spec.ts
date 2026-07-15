// Share affordances (hermetic): the recipe page shows a one-tap Share button
// near the title. Playwright never exposes the native share sheet, so we delete
// navigator.share before load to exercise the deterministic clipboard fallback:
// activating Share copies the canonical recipe.html?u=<at-uri>[&by=<handle>] URL
// for the currently viewed recipe and flashes a transient confirmation. Mirrors
// interactions.spec's routed-fixture recipe page.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');
const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');

const AUTHOR_DID = 'did:plc:26tsx5juuss4yealylyfbj4h';
const AUTHOR_PDS = 'https://morel.us-east.host.bsky.network';
const RECIPE_URI = `at://${AUTHOR_DID}/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D`;

const routeFixtures = async (page: Page): Promise<void> => {
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
    const url = route.request().url();
    if (url.includes('getRecord')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: atprotoFixture('getRecord-exchange.recipe.recipe.json'),
      });
    }
    // Interactions + comments + siblings: empty.
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
  });
};

// Delete navigator.share so the clipboard fallback path is exercised
// deterministically (the impl feature-detects `typeof navigator.share`).
const forceClipboardFallback = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    try {
      // @ts-expect-error — removing an optional web API for the test
      delete navigator.share;
    } catch {
      /* some engines define it non-configurable — the feature-detect still guards */
    }
  });
};

test('the recipe page shows a Share button that copies the canonical recipe URL (wiring)', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await forceClipboardFallback(page);
  await routeFixtures(page);
  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}&by=somechef.example.com`);
  await expect(page.locator('h2')).toContainText('White Chocolate', { timeout: 15_000 });

  // A real, accessible button sits near the title.
  const share = page.getByTestId('share-recipe');
  await expect(share).toBeVisible();
  await expect(share).toHaveAttribute('aria-label', /share/i);

  // The copy seam (mirrors the quick-copy `data-copy` idiom) carries the exact
  // canonical URL for the CURRENTLY VIEWED recipe under the live origin.
  const origin = new URL(page.url()).origin;
  const expected = `${origin}/recipe.html?u=${encodeURIComponent(RECIPE_URI)}&by=${encodeURIComponent('somechef.example.com')}`;
  await expect(share).toHaveAttribute('data-copy', expected);

  // Activating it puts that URL on the clipboard...
  await share.click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(expected);

  // ...and flashes a transient confirmation (same textContent-swap mechanism as
  // the quick-copy control).
  await expect(share).toContainText(/copied/i);
});
