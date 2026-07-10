// Account page — hermetic (no auth). The taste preference controls ("Only show
// me" / "Never show me", by meal + cuisine) are device-local, so they render and
// persist without a session. This guards the account taste UI: it mounts, offers
// both buckets, and a choice survives a reload (localStorage-backed).
import { expect, test } from '@playwright/test';

test('account taste prefs render both buckets and a choice persists across reload', async ({
  page,
}) => {
  await page.goto('/account.html');

  const section = page.getByTestId('taste-prefs');
  await expect(section).toBeVisible({ timeout: 15_000 });
  await expect(section).toContainText('Only show me');
  await expect(section).toContainText('Never show me');

  // Pick a "Never show me" cuisine — it persists across a reload.
  const thai = page.getByTestId('taste-never-cuisine-thai');
  await thai.check();
  await expect(thai).toBeChecked();

  await page.reload();
  await expect(page.getByTestId('taste-never-cuisine-thai')).toBeChecked();

  // Unchecking clears it (and persists cleared).
  await page.getByTestId('taste-never-cuisine-thai').uncheck();
  await page.reload();
  await expect(page.getByTestId('taste-never-cuisine-thai')).not.toBeChecked();
});
