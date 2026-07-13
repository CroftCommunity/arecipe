// Account page — hermetic (no auth). The taste preference control ("Never show
// me", by meal + cuisine) is device-local, so it renders and persists without a
// session. It's a single multi-select dropdown (the Browse `.facet-dd` popover);
// the "Only show me" bucket was removed. This guards the account taste UI: it
// mounts, opens, and a choice survives a reload (localStorage-backed).
import { expect, test } from '@playwright/test';

test('account taste prefs are a "Never show me" dropdown whose choice persists across reload', async ({
  page,
}) => {
  await page.goto('/account.html');

  const section = page.getByTestId('taste-prefs');
  await expect(section).toBeVisible({ timeout: 15_000 });
  await expect(section).toContainText('Never show me');
  // The "Only show me" bucket was removed from this page.
  await expect(section).not.toContainText('Only show me');

  const dropdown = page.getByTestId('taste-never');
  const openDropdown = async (): Promise<void> => {
    await dropdown.locator('summary').click();
    await expect(page.getByTestId('taste-never-cuisine-thai')).toBeVisible();
  };

  // Pick a "Never show me" cuisine — the summary count reflects it and it
  // persists across a reload.
  await openDropdown();
  await page.getByTestId('taste-never-cuisine-thai').check();
  await expect(page.getByTestId('taste-never-count')).toHaveText('1');

  await page.reload();
  await openDropdown();
  await expect(page.getByTestId('taste-never-cuisine-thai')).toBeChecked();

  // Unchecking clears it (and persists cleared).
  await page.getByTestId('taste-never-cuisine-thai').uncheck();
  await page.reload();
  await openDropdown();
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
