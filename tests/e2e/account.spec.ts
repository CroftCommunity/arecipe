// Account page — hermetic (no auth). The taste preference ("Never show me", by
// meal + cuisine) is device-local, so it renders and persists without a session.
// It's a titled block with two Browse-style dropdowns (Meals ▾ / Cuisines ▾),
// each carrying a count bubble; the "Only show me" bucket was removed. This
// guards the account taste UI: it mounts, the count bubble tracks + persists a
// choice (visible while collapsed), and clearing it removes the bubble.
import { expect, test } from '@playwright/test';

test('account taste "Never show me" excludes via per-dimension dropdowns with persistent counts', async ({
  page,
}) => {
  await page.goto('/account.html');

  const section = page.getByTestId('taste-prefs');
  await expect(section).toBeVisible({ timeout: 15_000 });
  await expect(section).toContainText('Never show me');
  // The "Only show me" bucket was removed from this page.
  await expect(section).not.toContainText('Only show me');

  // Two separate dropdowns — Meals ▾ and Cuisines ▾ (the Browse facet idiom).
  await expect(page.getByTestId('taste-never-category')).toBeVisible();
  const cuisines = page.getByTestId('taste-never-cuisine');
  await expect(cuisines).toBeVisible();

  const openCuisines = async (): Promise<void> => {
    await cuisines.locator('summary').click();
    await expect(page.getByTestId('taste-never-cuisine-thai')).toBeVisible();
  };
  const cuisineCount = page.getByTestId('taste-never-cuisine-count');

  // No exclusions yet → no count bubble.
  await expect(cuisineCount).toBeHidden();

  // Exclude a cuisine — the count bubble appears and persists across a reload,
  // visible without opening the dropdown.
  await openCuisines();
  await page.getByTestId('taste-never-cuisine-thai').check();
  await expect(cuisineCount).toHaveText('1');

  await page.reload();
  await expect(cuisineCount).toHaveText('1');
  await openCuisines();
  await expect(page.getByTestId('taste-never-cuisine-thai')).toBeChecked();

  // Unchecking clears it (and the bubble), persisted across a reload.
  await page.getByTestId('taste-never-cuisine-thai').uncheck();
  await page.reload();
  await expect(cuisineCount).toBeHidden();
  await openCuisines();
  await expect(page.getByTestId('taste-never-cuisine-thai')).not.toBeChecked();
});

test('calendar-publish section renders for everyone; enabling reveals config and persists', async ({
  page,
}) => {
  await page.goto('/account.html');
  const section = page.getByTestId('calendar-publish');
  await expect(section).toBeVisible({ timeout: 15_000 });
  await section.locator('summary').click(); // expand the <details>

  // The intro copy links "setup guide" before the feature is even enabled.
  const introGuide = page.getByTestId('calendar-guide-link-intro');
  await expect(introGuide).toBeVisible();
  await expect(introGuide).toHaveAttribute('href', './calendar-setup.html');

  // Config body stays hidden until the feature is enabled on this device.
  await expect(page.getByTestId('calendar-config')).toBeHidden();
  await page.getByTestId('calendar-enabled').check();
  await expect(page.getByTestId('calendar-config')).toBeVisible();
  await expect(page.getByTestId('calendar-repo')).toBeVisible();
  await expect(page.getByTestId('calendar-guide-link')).toBeVisible();

  // The enable toggle is device-local and survives a reload.
  await page.reload();
  await page.getByTestId('calendar-publish').locator('summary').click();
  await expect(page.getByTestId('calendar-enabled')).toBeChecked();
});
