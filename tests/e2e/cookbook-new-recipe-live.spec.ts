// Phase 10 wiring (@live): the "New Recipe" button on the viewer's own signed-in
// Cookbook opens the recipe builder (editor.html). It renders only on the own
// cookbook (viewer-relative, like the source control), so it's exercised @live.
import { expect, test } from '@playwright/test';
import { readEnv, signIn, TEST_DID } from './helpers/live.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';

test('@live New Recipe on own Cookbook opens the editor', async ({ page, baseURL }) => {
  test.skip(HANDLE === '' || PASSWORD === '', 'needs BSKY_TEST_* creds');
  test.setTimeout(180_000);

  await signIn(page, { handle: HANDLE, password: PASSWORD, origin: baseURL ?? 'http://127.0.0.1:4173' });
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

  await page.goto('/cookbook.html');
  // SWR content-freshness note renders on the own signed-in cookbook.
  await expect(page.getByTestId('cookbook-freshness')).toContainText('as of', { timeout: 30_000 });
  const newRecipe = page.getByTestId('cookbook-new-recipe');
  await expect(newRecipe).toBeVisible({ timeout: 30_000 });
  await expect(newRecipe).toHaveAttribute('href', /editor\.html$/);
  await newRecipe.click();
  await expect(page).toHaveURL(/\/editor\.html$/, { timeout: 30_000 });
});
