// Phase 5c wiring (revised): first load follows prefers-color-scheme; the
// top-bar toggle is a 2-state flip that always visibly changes the theme
// and persists across reloads and pages.
import { expect, test } from '@playwright/test';

const bgOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('first load follows the system preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('one tap flips the theme, changes colors, and persists (wiring)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const lightBg = await bgOf(page);

  // A SINGLE tap must visibly flip (the old 3-state cycle had a dead click).
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await bgOf(page)).not.toBe(lightBg);

  // Persists across a reload and across documents (same localStorage).
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/settings.html');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
