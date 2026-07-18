// User guide page (user-guide.html): a static, no-auth help page whose first
// entry walks through share-to-import. Reached from Settings → About.
import { expect, test } from '@playwright/test';

test('the user guide leads with the share-to-import walkthrough', async ({ page }) => {
  await page.goto('/user-guide.html');
  await expect(page.getByTestId('user-guide-title')).toBeVisible();
  const share = page.getByTestId('guide-entry-share');
  await expect(share).toBeVisible();
  await expect(share.locator('h3')).toContainText(/shar(e|ing)/i);
  // Honest constraints are present, not buried.
  await expect(share).toContainText(/Android/i);
  await expect(share).toContainText(/Publish/i);
});

test('Settings links to the user guide', async ({ page }) => {
  await page.goto('/settings.html');
  const link = page.getByTestId('settings-user-guide');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', './user-guide.html');
  await link.click();
  await expect(page).toHaveURL(/user-guide\.html/);
  await expect(page.getByTestId('guide-entry-share')).toBeVisible();
});
