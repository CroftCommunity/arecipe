// Meals planner — e2e wiring, run against the BUILT bundle.
// Phase 1 (route skeleton): the entry point (meals.html → meals.js → meals.ts
// main()) mounts the shared shell and shows the "Meals" heading. RED until the
// page + build registration exist; GREEN once the route is real and built.
import { expect, test } from '@playwright/test';

test('meals.html mounts the shared shell with a Meals heading (wiring)', async ({ page }) => {
  await page.goto('/meals.html');

  // Shell chrome came from mountShell: the shared topbar wordmark + tab bar.
  await expect(page.locator('header.topbar h1.wordmark')).toHaveText('arecipe');
  await expect(page.getByTestId('tab-browse')).toBeVisible();

  // The page's own content: the planner heading.
  await expect(page.getByRole('heading', { level: 2, name: 'Meals' })).toBeVisible();
});
