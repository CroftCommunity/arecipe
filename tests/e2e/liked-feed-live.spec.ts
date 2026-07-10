// Phase 9 wiring (@live half): the Cookbook source filter (All / Mine / Liked).
// Signed in, like a recipe, then open your own Cookbook and select "Liked" — the
// hearted recipe loads via loadLikedFeed (a separate cross-PDS fetch of your
// `liked` records, lazy per OQ12) and appears in the feed. Guarded by a
// whole-collection purge of app.arecipe.interaction on the test account.
import { expect, test } from '@playwright/test';
import { purgeCollection, readEnv, signIn, TEST_DID } from './helpers/live.js';
import { INTERACTION_COLLECTION } from '../../src/social/interactions.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';
const APP_PASSWORD = env['BSKY_TEST_APP_PASSWORD'] ?? '';
const RECIPE_URI =
  'at://did:plc:26tsx5juuss4yealylyfbj4h/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D';

test('@live like a recipe → it appears under the Cookbook "Liked" filter', async ({
  page,
  baseURL,
}) => {
  test.skip(HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '', 'needs BSKY_TEST_* creds');
  test.setTimeout(180_000);
  await purgeCollection(INTERACTION_COLLECTION, { handle: HANDLE, appPassword: APP_PASSWORD });

  await signIn(page, {
    handle: HANDLE,
    password: PASSWORD,
    origin: baseURL ?? 'http://127.0.0.1:4173',
  });
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

  // Like the recipe (the write path fixed in this branch).
  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}`);
  const likeBtn = page.getByTestId('like-button');
  await expect(likeBtn).toBeEnabled({ timeout: 30_000 });
  await likeBtn.click();
  await expect(page.getByTestId('like-count')).toHaveText('1 like', { timeout: 30_000 });

  // Own Cookbook → the source control is present; select "Liked".
  await page.goto('/cookbook.html');
  await expect(page.getByTestId('source-liked')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('source-liked').click();

  // The hearted recipe loads (cross-PDS) into the feed.
  await expect(
    page.getByTestId('recipe-item').filter({ hasText: 'White Chocolate' }),
  ).toBeVisible({ timeout: 30_000 });
});
