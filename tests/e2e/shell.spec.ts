// SPIKE (Phase 0 / D3): harness probe — proves Playwright can exercise the
// built bundle end-to-end: shell render, service-worker registration, and an
// IndexedDB round-trip. These three are the platform pieces every later
// phase's wiring tests lean on.
import { expect, test } from '@playwright/test';

test('shell renders from the built bundle', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('arecipe — no recipes yet');
});

test('IndexedDB round-trip works under the harness', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('idb-status')).toHaveText('idb: idb-ok');
});

test('service worker registers and activates under the harness', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sw-status')).toHaveText('sw: active', {
    timeout: 15_000,
  });
});
