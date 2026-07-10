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

test('the 5-tab bottom bar fits a narrow phone without horizontal overflow (Phase 2 risk)', async ({
  page,
}) => {
  // Phase 2 added Meals as a 5th destination; the mobile tab bar is a
  // no-wrap flex row, so 5 tabs must still fit a small phone. iPhone SE width.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/meals.html');

  // All five destinations are present and the active one is Meals.
  for (const id of ['tab-browse', 'tab-cookbook', 'tab-mine', 'tab-meals', 'tab-reference']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('tab-meals')).toHaveClass(/tab--active/);

  // The tab bar must not overflow its own width (no clipped/scrolled tabs).
  const overflow = await page.locator('nav.tabs').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1); // ≤1px sub-pixel tolerance
});
