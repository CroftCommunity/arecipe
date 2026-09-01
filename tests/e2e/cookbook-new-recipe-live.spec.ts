// Phase 10 wiring (@live): the "Alchemy" link on the viewer's own signed-in
// Cookbook opens the authoring hub (mine.html). It renders only on the own
// cookbook (viewer-relative, like the source control), so it's exercised @live.
import { expect, test } from '@playwright/test';
import { readEnv, signIn, TEST_DID } from './helpers/live.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';

test('@live Alchemy on own Cookbook opens the authoring hub', async ({ page, baseURL }) => {
  test.skip(HANDLE === '' || PASSWORD === '', 'needs BSKY_TEST_* creds');
  test.setTimeout(180_000);

  await signIn(page, { handle: HANDLE, password: PASSWORD, origin: baseURL ?? 'http://127.0.0.1:4173' });
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

  await page.goto('/cookbook.html');
  // SWR content-freshness note renders on the own signed-in cookbook.
  await expect(page.getByTestId('cookbook-freshness')).toContainText('as of', { timeout: 30_000 });
  const alchemy = page.getByTestId('cookbook-alchemy');
  await expect(alchemy).toBeVisible({ timeout: 30_000 });
  await expect(alchemy).toHaveAttribute('href', /mine\.html$/);
  await alchemy.click();
  await expect(page).toHaveURL(/\/mine\.html$/, { timeout: 30_000 });
});
