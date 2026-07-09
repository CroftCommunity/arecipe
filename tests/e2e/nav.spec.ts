// Phase 5b wiring: page-per-destination navigation. Real documents, real
// links, native back button — the blockdoku pattern.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('tabs navigate between documents and native back works (wiring)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tab-mine').click();
  await expect(page).toHaveURL(/mine\.html$/);
  // Signed out, My recipes shows a pointer to the dedicated sign-in page — the
  // login form itself now lives on signin.html, not here.
  const minePointer = page.getByTestId('mine-signin-pointer');
  await expect(minePointer).toBeVisible();
  await expect(minePointer).toHaveAttribute('href', /signin\.html$/);
  await expect(page.getByTestId('oauth-signin')).toHaveCount(0);
  // Native back returns to Browse — no SPA router, no trapped state.
  await page.goBack();
  await expect(page.getByTestId('handle-input')).toBeVisible();
  // Wordmark is the home link from anywhere.
  await page.getByTestId('tab-mine').click();
  await page.locator('a.wordmark-link').click();
  await expect(page.getByTestId('handle-input')).toBeVisible();
});

test('every signed-out "Sign in" affordance points at the dedicated page (wiring)', async ({
  page,
}) => {
  // Nav top-right, on any page.
  await page.goto('/');
  await expect(page.getByTestId('nav-signin')).toHaveAttribute('href', /signin\.html$/);
  // Cookbook signed-out gate.
  await page.goto('/cookbook.html');
  await expect(page.getByTestId('cookbook-signin-link')).toHaveAttribute('href', /signin\.html$/);
  // Account signed-out note.
  await page.goto('/account.html');
  await expect(
    page.getByTestId('account-signed-out').getByRole('link'),
  ).toHaveAttribute('href', /signin\.html$/);
  // My recipes signed-out pointer.
  await page.goto('/mine.html');
  await expect(page.getByTestId('mine-signin-pointer')).toHaveAttribute('href', /signin\.html$/);
});

test('settings page: app management with build facts, integrity explainer, About', async ({
  page,
}) => {
  await page.goto('/settings.html');
  await expect(page.getByTestId('build-facts')).toContainText(/version/i);
  await expect(page.getByTestId('integrity-explainer')).toContainText(/fingerprint/i);
  await expect(page.getByTestId('about')).toContainText(/AT Protocol/);
});

test('account page shows the signed-out state with a pointer to sign in', async ({ page }) => {
  await page.goto('/account.html');
  await expect(page.getByTestId('account-signed-out')).toContainText(/sign in/i);
});

test('the Browse document ships zero auth code (bundle split)', () => {
  // Hashed bundle names (8b): find the browse bundle via build-info.
  const info = JSON.parse(
    readFileSync(new URL('../../dist/build-info.json', import.meta.url), 'utf8'),
  ) as { pages: Record<string, { file: string }> };
  const browse = readFileSync(
    new URL(`../../dist/${info.pages['browse']!.file}`, import.meta.url),
    'utf8',
  );
  expect(browse).not.toContain('oauth');
  expect(browse.length).toBeLessThan(200_000); // sanity: an order smaller than the auth pages
});
