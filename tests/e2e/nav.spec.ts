// Phase 5b wiring: page-per-destination navigation. Real documents, real
// links, native back button — the blockdoku pattern.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('the Plan tab navigates to plan.html and mounts the plan builder (wiring)', async ({
  page,
}) => {
  await page.goto('/');
  const tab = page.getByTestId('tab-plan');
  await expect(tab).toHaveText('Plan');
  await expect(tab).toHaveAttribute('href', /plan\.html$/);
  await tab.click();
  // Not `$`-anchored: plan.html grounds itself on mount and syncs the anchor to
  // the URL as `?start=YYYY-MM-DD` (calendar unification, D6) — measured landing
  // ~25ms after the click. A `$` anchor made this a race that only passed when
  // the first poll beat the replaceState, which held on CI's slower runner and
  // failed on a fast dev machine. Assert the document, tolerate its query.
  await expect(page).toHaveURL(/plan\.html(\?|$)/);
  await expect(page.getByTestId('builder')).toBeVisible();
});

test('tabs navigate between documents and native back works (wiring)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tab-plan').click();
  // Not `$`-anchored: plan.html grounds itself on mount and syncs the anchor to
  // the URL as `?start=YYYY-MM-DD` (calendar unification, D6) — measured landing
  // ~25ms after the click. A `$` anchor made this a race that only passed when
  // the first poll beat the replaceState, which held on CI's slower runner and
  // failed on a fast dev machine. Assert the document, tolerate its query.
  await expect(page).toHaveURL(/plan\.html(\?|$)/);
  // Plan is a real document (page-per-destination): its own content mounts.
  await expect(page.getByTestId('builder')).toBeVisible();
  // Native back returns to Browse — no SPA router, no trapped state.
  await page.goBack();
  await expect(page.getByTestId('recipe-search')).toBeVisible();
  // Wordmark is the home link from anywhere.
  await page.getByTestId('tab-plan').click();
  await page.locator('a.wordmark-link').click();
  await expect(page.getByTestId('recipe-search')).toBeVisible();
});

test('every signed-out "Sign in" affordance points at the dedicated page (wiring)', async ({
  page,
}) => {
  // Nav top-right, on any page.
  await page.goto('/');
  await expect(page.getByTestId('nav-signin')).toHaveAttribute('href', /signin\.html$/);
  // (The Cookbook no longer has a signed-out gate — it redirects to Browse, see
  // cookbook.spec.ts. Its former sign-in link is gone.)
  // Account signed-out note.
  await page.goto('/account.html');
  await expect(
    page.getByTestId('account-signed-out').getByRole('link'),
  ).toHaveAttribute('href', /signin\.html$/);
  // Alchemy signed-out pointer.
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
