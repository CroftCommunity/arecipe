// Settings page. The "Only show me" dietary preference moved to the Account
// page's Taste section — its suite lives in account.spec.ts.
import { expect, test } from '@playwright/test';

test('settings: Hidden recipes is collapsed by default with a count, expandable', async ({
  page,
}) => {
  await page.goto('/settings.html');
  const section = page.getByTestId('hidden-recipes');
  await expect(section).toBeVisible();
  // Collapsed by default: the summary carries a count; rows are hidden until opened.
  const summary = section.locator('summary').first();
  await expect(summary).toContainText(/Hidden recipes \(\d+\)/);
  const firstRow = section.getByTestId('hidden-row').first();
  await expect(firstRow).toBeHidden();
  // Expand → the rows appear.
  await summary.click();
  await expect(firstRow).toBeVisible();
});
