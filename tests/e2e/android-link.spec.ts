// "Get the Android app" on Account (plan 2026-07-18-1 D7) — hermetic, no
// auth: the card renders signed-in or out, so the signed-out page must show
// it. The href is the STABLE latest-release download URL — GitHub resolves
// it to the newest android-v* release, so the site needs no deploy when a
// new shell ships.
import { expect, test } from '@playwright/test';

test('Account offers the Android app via the stable latest-release URL', async ({ page }) => {
  await page.goto('/account.html');

  const link = page.getByTestId('android-app-link');
  await expect(link).toBeVisible({ timeout: 15_000 });
  await expect(link).toHaveAttribute(
    'href',
    'https://github.com/CroftCommunity/arecipe/releases/latest/download/arecipe.apk',
  );
  await expect(link).toContainText('Android');
});
