// Meals planner — e2e wiring, run against the BUILT bundle.
// Phase 1 (route skeleton): the entry point (meals.html → meals.js → meals.ts
// main()) mounts the shared shell and shows the "Meals" heading. RED until the
// page + build registration exist; GREEN once the route is real and built.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Phase 7: route arecipe's real feed reads to fixtures so the palette's Browse
// source (starter feed), the Cookbook source, and add-a-cook-by-handle all load
// hermetically — any DID resolves to one fake PDS that serves the recorded
// recipe list, re-uri'd per repo so cards are distinct.
const recipeList = () =>
  JSON.parse(
    readFileSync(new URL('../fixtures/atproto/listRecords-exchange.recipe.recipe.json', import.meta.url), 'utf8'),
  ) as { records: { uri: string; cid: string; value: { name: string } }[] };

const routeFeeds = async (page: Page): Promise<void> => {
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: did,
        service: [
          { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.test' },
        ],
      }),
    });
  });
  await page.route('https://pds.test/**', async (route) => {
    const repo = new URL(route.request().url()).searchParams.get('repo') ?? 'did:plc:x';
    const list = recipeList();
    for (const r of list.records) r.uri = r.uri.replace(/did:plc:[a-z0-9]+/, repo);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) });
  });
  await page.route('https://public.api.bsky.app/**', async (route) => {
    if (route.request().url().includes('resolveHandle')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ did: 'did:plc:handleadd' }) });
    } else {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
  });
};

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

test('palette: Browse source loads, filter narrows, source switch toggles, add-a-cook appends', async ({
  page,
}) => {
  await routeFeeds(page);
  await page.goto('/meals.html'); // signed out → Browse is the default source

  // Browse (starter feed) populates the palette from the routed fixtures.
  const chips = page.getByTestId('palette-chip');
  await expect(chips.first()).toBeVisible();
  const initialCount = await chips.count();
  expect(initialCount).toBeGreaterThan(0);

  // Filtering to a non-matching term empties the list; a real substring narrows.
  const filter = page.getByTestId('palette-filter');
  await filter.fill('zzzznomatch');
  await expect(chips).toHaveCount(0);
  await filter.fill('Ham');
  const hamCount = await chips.count();
  expect(hamCount).toBeGreaterThan(0);
  expect(hamCount).toBeLessThan(initialCount);
  await filter.fill('');

  // Source switch: Browse active by default; clicking My Cookbook toggles it.
  await expect(page.getByTestId('source-browse')).toHaveClass(/src-btn--active/);
  await page.getByTestId('source-cookbook').click();
  await expect(page.getByTestId('source-cookbook')).toHaveClass(/src-btn--active/);
  await expect(page.getByTestId('source-browse')).not.toHaveClass(/src-btn--active/);

  // Back to Browse, then add a cook by handle appends that cook's recipes.
  await page.getByTestId('source-browse').click();
  await expect(chips.first()).toBeVisible();
  const beforeAdd = await chips.count();
  await page.getByTestId('palette-handle-input').fill('rdur.dev');
  await page.getByTestId('palette-handle-add').click();
  await expect.poll(() => chips.count()).toBeGreaterThan(beforeAdd);
});
