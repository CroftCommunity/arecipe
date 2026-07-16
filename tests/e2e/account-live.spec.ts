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

// Danger zone (plan 2026-07-16-5): signed in, the sign-out + delete-all bubble
// is the LAST section on the page. Sign out takes the inline two-step confirm;
// delete reveals the type-the-handle challenge with its button disabled until
// the real handle is typed. Both flows are CANCELLED here — no native dialog
// ever opens and the live account's data is never touched.
test('@live signed-in Account renders the danger zone last, with guarded sign-out and delete', async ({
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
  await page.goto('/account.html');
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

  const danger = page.getByTestId('account-danger');
  await expect(danger).toBeVisible();
  // Last section in the panel — the bottom of the page.
  await expect(page.locator('.panel > :last-child')).toHaveAttribute(
    'data-testid',
    'account-danger',
  );

  // Sign out: two-step confirm; cancel restores without signing out.
  await danger.getByTestId('sign-out').click();
  await expect(danger.getByTestId('sign-out-confirm')).toBeVisible();
  await danger.getByTestId('sign-out-cancel').click();
  await expect(danger.getByTestId('sign-out')).toBeVisible();
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID);

  // Delete: honored copy + challenge gated on the real handle; cancelled
  // before the hard confirm could ever appear.
  await expect(danger.getByTestId('delete-data-copy')).toContainText(
    'does not delete exchange.recipe',
  );
  await danger.getByTestId('delete-data').click();
  const confirmBtn = danger.getByTestId('delete-data-confirm');
  await expect(confirmBtn).toBeDisabled();
  await danger.getByTestId('delete-data-input').fill('wrong.handle.example');
  await expect(confirmBtn).toBeDisabled();
  await danger.getByTestId('delete-data-input').fill(HANDLE);
  await expect(confirmBtn).toBeEnabled();
  await danger.getByTestId('delete-data-cancel').click();
  await expect(danger.getByTestId('delete-data')).toBeVisible();
});
