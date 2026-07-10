// Phase 9c wiring (hermetic half): the like count on the recipe page. Mirrors
// 9a/9b — the WRITE (like toggle) is proven @live; here, with no creds, we
// prove the friends-scoped READ: signed-out, the recipe page shows the author's
// like count read-only, with the like button disabled. There is NO save control
// anywhere — `saved` was removed; like is the single interaction.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');
const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');

const AUTHOR_DID = 'did:plc:26tsx5juuss4yealylyfbj4h';
const AUTHOR_PDS = 'https://morel.us-east.host.bsky.network';
const RECIPE_URI = `at://${AUTHOR_DID}/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D`;
const INTERACTION_COLLECTION = 'app.arecipe.interaction';

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
    if (url.includes(INTERACTION_COLLECTION)) {
      // The author has liked their own recipe → a friends-scoped count of 1.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          records: [
            {
              uri: `at://${AUTHOR_DID}/${INTERACTION_COLLECTION}/like1`,
              cid: 'bafyreilike',
              value: { kind: 'liked', recipe: { uri: RECIPE_URI, cid: 'bafyreirecipe' }, createdAt: '2026-07-08T00:00:00Z' },
            },
          ],
        }),
      });
    }
    // Comments + anything else: empty.
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
  });
};

test('signed-out recipe page shows a read-only like count (wiring)', async ({ page }) => {
  await routeFixtures(page);
  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}`);
  await expect(page.locator('h2')).toContainText('White Chocolate', { timeout: 15_000 });
  await expect(page.getByTestId('like-count')).toHaveText('1 like');
  // Signed-out: the count is read-only — the like button is disabled. The save
  // control is gone entirely (not merely hidden): `saved` was removed.
  await expect(page.getByTestId('like-button')).toBeDisabled();
  await expect(page.getByTestId('save-button')).toHaveCount(0);
});

// Phase 3 wiring: the like control (heart + count) overlays the recipe banner
// image in the upper-right, not a separate section below the detail. Assert the
// structural fact (it is a descendant of .photo-wrap--banner via .like-overlay)
// AND a top-right position (its box sits in the upper-right quadrant of the
// banner), exercised through the real recipe-page render.
test('the like control overlays the banner image, upper-right (wiring)', async ({ page }) => {
  await routeFixtures(page);
  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}`);
  await expect(page.getByTestId('like-count')).toHaveText('1 like', { timeout: 15_000 });

  // Heart + count both live inside the banner's .like-overlay.
  const overlayLike = page.locator('.photo-wrap--banner .like-overlay [data-testid="like-button"]');
  const overlayCount = page.locator('.photo-wrap--banner .like-overlay [data-testid="like-count"]');
  await expect(overlayLike).toBeVisible();
  await expect(overlayCount).toBeVisible();

  // Positioned in the upper-right quadrant of the banner.
  const banner = page.locator('.photo-wrap--banner');
  const bBox = (await banner.boundingBox())!;
  const oBox = (await overlayLike.boundingBox())!;
  const oCenterX = oBox.x + oBox.width / 2;
  const oCenterY = oBox.y + oBox.height / 2;
  expect(oCenterX).toBeGreaterThan(bBox.x + bBox.width / 2); // right half
  expect(oCenterY).toBeLessThan(bBox.y + bBox.height / 2); // top half
});
