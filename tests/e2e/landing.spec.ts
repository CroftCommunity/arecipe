// Signed-in landing (zero-auth): a signed-in visitor arriving at the home entry
// lands on their Cookbook; a signed-out visitor (or one clicking the Browse tab)
// lands on Browse. Browse ships no auth code, so the signal is a localStorage
// "session hint" written by the auth boot flow and read by a pre-paint inline
// script in index.html. These tests set the hint directly (no real OAuth needed)
// and exercise the redirect logic + the in-app-referrer exemption.
import { expect, test } from '@playwright/test';

const setHint = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('arecipe-session', '1');
    } catch {
      /* ignore */
    }
  });
};

test('signed-in home landing redirects to the Cookbook', async ({ page }) => {
  await setHint(page);
  await page.goto('/'); // home entry, no in-app referrer
  await expect(page).toHaveURL(/\/cookbook\.html$/, { timeout: 15_000 });
});

test('signed-out home landing stays on Browse', async ({ page }) => {
  await page.goto('/'); // no session hint
  await expect(page.getByTestId('find-recipes')).toBeVisible({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/cookbook/);
});

test('signed-in Browse-tab click stays on Browse (in-app referrer exempt)', async ({ page }) => {
  await setHint(page);
  // Land somewhere in-app first so the next nav carries a same-origin referrer.
  await page.goto('/cookbook.html');
  await page.getByTestId('tab-browse').click();
  await expect(page).toHaveURL(/\/index\.html$/, { timeout: 15_000 });
  await expect(page.getByTestId('find-recipes')).toBeVisible();
});
