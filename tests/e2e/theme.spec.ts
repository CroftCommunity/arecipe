// Phase 5c wiring: native light/dark. Auto follows the system preference;
// the top-bar toggle cycles auto → light → dark and the choice persists.
import { expect, test } from '@playwright/test';

const bgOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('auto mode follows the system preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the toggle cycles to dark, changes rendered colors, and persists (wiring)', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const lightBg = await bgOf(page);
  // auto → light → dark
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await bgOf(page)).not.toBe(lightBg);
  // Persists across a reload (and pages — same localStorage).
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/settings.html');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
