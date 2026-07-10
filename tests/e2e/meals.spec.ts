// Meals planner — e2e wiring, run against the BUILT bundle.
// Phase 1 (route skeleton): the entry point (meals.html → meals.js → meals.ts
// main()) mounts the shared shell and shows the "Meals" heading. RED until the
// page + build registration exist; GREEN once the route is real and built.
import { expect, test, type Page } from '@playwright/test';

// Phase 5 palette injection: the page reads an optional localStorage seed
// (`arecipe.meals.palette-seed`) as its default provider — inert in production
// (empty until Phase 7 wires the real Cookbook/Browse providers), seeded here.
const PALETTE = [
  { uri: 'at://did:plc:cook/exchange.recipe.recipe/lasagna', cid: 'bafylasagna', name: 'Lasagna' },
  { uri: 'at://did:plc:cook/exchange.recipe.recipe/tacos', cid: 'bafytacos', name: 'Tacos' },
];

const seedPalette = async (page: Page, items: typeof PALETTE = PALETTE): Promise<void> => {
  await page.addInitScript((seed) => {
    try {
      localStorage.setItem('arecipe.meals.palette-seed', JSON.stringify(seed));
    } catch {
      /* private mode: the palette just stays empty */
    }
  }, items);
};

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

test('tap-to-place: arm a recipe, place it on a day, persist across reload, clear, add a week', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/meals.html');

  // The seeded palette renders as tappable chips.
  const lasagna = page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' });
  await expect(lasagna).toBeVisible();

  // Arm Lasagna, then place it on Tuesday (Mon=0, Tue=1) of week 1.
  await lasagna.click();
  const tue = page.getByTestId('week-row').first().getByTestId('day-slot').nth(1);
  await tue.click();
  await expect(tue.getByTestId('slot-filled')).toHaveText('Lasagna');

  // Persist across reload: the local store is the buffer (the PDS record is P9).
  await page.reload();
  const tueAfter = page.getByTestId('week-row').first().getByTestId('day-slot').nth(1);
  await expect(tueAfter.getByTestId('slot-filled')).toHaveText('Lasagna');

  // Clear the slot with its × control.
  await tueAfter.getByTestId('slot-clear').click();
  await expect(tueAfter.getByTestId('slot-filled')).toHaveCount(0);

  // Add a second week.
  await page.getByTestId('add-week').click();
  await expect(page.getByTestId('week-row')).toHaveCount(2);
});

test('calendar: per-week repeat stamps that week N times, in order, each carrying its days', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/meals.html');

  // Place Lasagna on Monday (day 0) of week 1.
  await page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' }).click();
  await page.getByTestId('week-row').first().getByTestId('day-slot').first().click();

  // Set week 1 to repeat 3×.
  const repeat = page.getByTestId('week-row').first().getByTestId('week-repeat');
  await repeat.fill('3');
  await repeat.blur();

  // The calendar below stamps week 1 three times, each carrying the filled day.
  const calWeeks = page.getByTestId('cal-week');
  await expect(calWeeks).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(calWeeks.nth(i)).toContainText('Lasagna');
  }
});

test('calendar: shows an empty state until something is planned', async ({ page }) => {
  await seedPalette(page);
  await page.goto('/meals.html');
  await expect(page.getByTestId('calendar-empty')).toBeVisible();
});
