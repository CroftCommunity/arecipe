// Phase 6 wiring (@live half): the cookbook members list moved from Cookbook to
// Account. Signed in as the test account, the Account page resolves the real
// Bluesky graph (starters + follows + followers, always including "you") and
// renders the members list. The hermetic half proves the render logic (unit)
// and that Cookbook no longer shows members; here we prove the signed-in mount
// on Account end-to-end against the real PDS.
import { expect, test } from '@playwright/test';
import { readEnv, signIn, TEST_DID } from './helpers/live.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';

test('@live signed-in Account shows the cookbook members list (Phase 6)', async ({
  page,
  baseURL,
}) => {
  test.skip(HANDLE === '' || PASSWORD === '', 'needs BSKY_TEST_* credentials in .env');
  test.setTimeout(180_000);

  await signIn(page, {
    handle: HANDLE,
    password: PASSWORD,
    origin: baseURL ?? 'http://127.0.0.1:4173',
  });
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

  await page.goto('/account.html');
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });
  // The members list (moved from Cookbook in Phase 6) renders on Account, with at
  // least "you" as a member.
  await expect(page.getByTestId('cookbook-members')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('cookbook-member').first()).toBeVisible({ timeout: 30_000 });
});
