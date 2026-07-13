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
type SeedItem = { uri: string; cid: string; name: string; cuisine?: string; category?: string };
const PALETTE: SeedItem[] = [
  { uri: 'at://did:plc:cook/exchange.recipe.recipe/lasagna', cid: 'bafylasagna', name: 'Lasagna' },
  { uri: 'at://did:plc:cook/exchange.recipe.recipe/tacos', cid: 'bafytacos', name: 'Tacos' },
];

const seedPalette = async (page: Page, items: SeedItem[] = PALETTE): Promise<void> => {
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

  // A single-week plan shows no Remove (you can't remove the only week).
  await expect(page.getByTestId('remove-week')).toHaveCount(0);

  // Add a second week — now Remove appears (on both weeks).
  await page.getByTestId('add-week').click();
  await expect(page.getByTestId('week-row')).toHaveCount(2);
  await expect(page.getByTestId('remove-week')).toHaveCount(2);
});

test('reset: clears the plan back to one empty week (inline confirm; cancel is safe)', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/meals.html');

  // Build some state: two weeks with a placed recipe.
  await page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' }).click();
  await page.getByTestId('week-row').first().getByTestId('day-slot').first().click();
  await page.getByTestId('add-week').click();
  await expect(page.getByTestId('week-row')).toHaveCount(2);
  await expect(page.getByTestId('slot-filled').first()).toBeVisible();

  // Reset → Cancel leaves everything intact.
  await page.getByTestId('reset-plan').click();
  await page.getByTestId('reset-cancel').click();
  await expect(page.getByTestId('week-row')).toHaveCount(2);
  await expect(page.getByTestId('slot-filled').first()).toBeVisible();

  // Reset → Confirm clears the plan: one empty week, nothing placed.
  await page.getByTestId('reset-plan').click();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByTestId('week-row')).toHaveCount(1);
  await expect(page.getByTestId('slot-filled')).toHaveCount(0);
  await expect(page.getByTestId('calendar-empty')).toBeVisible();
});

test('repeat planned weeks: duplicates the whole plan (meals and all) instead of adding a blank week', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/meals.html');

  // Place Lasagna on Monday (day 0) of week 1.
  await page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' }).click();
  await page.getByTestId('week-row').first().getByTestId('day-slot').first().click();
  await expect(
    page.getByTestId('week-row').first().getByTestId('slot-filled'),
  ).toHaveText('Lasagna');

  // "Repeat planned weeks" appends a copy of the current plan (week 1 → 1 + 2),
  // and the copy carries the same placed meal.
  await page.getByTestId('repeat-weeks').click();
  await expect(page.getByTestId('week-row')).toHaveCount(2);
  await expect(page.getByTestId('week-row').nth(1).getByTestId('slot-filled')).toHaveText(
    'Lasagna',
  );

  // The calendar below stamps both weeks, each carrying the filled day.
  const calWeeks = page.getByTestId('cal-week');
  await expect(calWeeks).toHaveCount(2);
  await expect(calWeeks.nth(0)).toContainText('Lasagna');
  await expect(calWeeks.nth(1)).toContainText('Lasagna');
});

test('calendar: shows an empty state until something is planned', async ({ page }) => {
  await seedPalette(page);
  await page.goto('/meals.html');
  await expect(page.getByTestId('calendar-empty')).toBeVisible();
});

test('drag (desktop): drag a palette chip onto a day places it; drag a filled slot moves it', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/meals.html');

  const lasagna = page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' });
  const week1 = page.getByTestId('week-row').first();
  const mon = week1.getByTestId('day-slot').nth(0);
  const wed = week1.getByTestId('day-slot').nth(2);

  // Drag the palette chip onto Monday — same placement as tapping.
  await lasagna.dragTo(mon);
  await expect(mon.getByTestId('slot-filled')).toHaveText('Lasagna');

  // Drag the placed meal from Monday onto Wednesday — a move (source clears).
  await mon.getByTestId('day-meal').dragTo(wed);
  await expect(wed.getByTestId('slot-filled')).toHaveText('Lasagna');
  await expect(mon.getByTestId('slot-filled')).toHaveCount(0);
});

test('multi-meal: several recipes stack on one day and all show on the calendar', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/meals.html');

  const mon = page.getByTestId('week-row').first().getByTestId('day-slot').first();

  // Arm + place Lasagna, then arm + place Tacos on the SAME day — both stack.
  await page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' }).click();
  await mon.click();
  await page.getByTestId('palette-chip').filter({ hasText: 'Tacos' }).click();
  await mon.click();
  await expect(mon.getByTestId('slot-filled')).toHaveCount(2);

  // Both survive a reload (the local buffer holds the meals list).
  await page.reload();
  const monAfter = page.getByTestId('week-row').first().getByTestId('day-slot').first();
  await expect(monAfter.getByTestId('slot-filled')).toHaveCount(2);

  // The calendar day carries both meals.
  const calDay = page.getByTestId('cal-week').first().locator('.cal-day').first();
  await expect(calDay).toContainText('Lasagna');
  await expect(calDay).toContainText('Tacos');
});

test('meals/day cap: lowering it to 1 blocks adding a second meal', async ({ page }) => {
  await seedPalette(page);
  await page.goto('/meals.html');

  // Set the cap to 1 up front.
  await page.getByTestId('meals-per-day').selectOption('1');

  const mon = page.getByTestId('week-row').first().getByTestId('day-slot').first();
  await page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' }).click();
  await mon.click();
  await expect(mon.getByTestId('slot-filled')).toHaveCount(1);

  // A second placement on the full day is a no-op (still one meal).
  await page.getByTestId('palette-chip').filter({ hasText: 'Tacos' }).click();
  await mon.click();
  await expect(mon.getByTestId('slot-filled')).toHaveCount(1);
  await expect(mon.getByTestId('slot-filled')).toHaveText('Lasagna');

  // The cap survives a reload (persisted on the plan).
  await page.reload();
  await expect(page.getByTestId('meals-per-day')).toHaveValue('1');
});

test('calendar labels a meal with the recipe’s own category ("Breakfast: …")', async ({ page }) => {
  await seedPalette(page, [
    { uri: 'at://did:plc:cook/exchange.recipe.recipe/oatmeal', cid: 'bafyo', name: 'Oatmeal', category: 'breakfast' },
  ]);
  await page.goto('/meals.html');

  await page.getByTestId('palette-chip').filter({ hasText: 'Oatmeal' }).click();
  await page.getByTestId('week-row').first().getByTestId('day-slot').first().click();

  // The calendar line reads "Breakfast: Oatmeal" (label from recipeCategory).
  await expect(page.getByTestId('cal-week').first()).toContainText('Breakfast: Oatmeal');
});

test('mobile: expand a day by its header, then Clear day removes its meals', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await seedPalette(page);
  await page.goto('/meals.html');

  const mon = page.getByTestId('week-row').first().getByTestId('day-slot').first();
  await page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' }).click();
  await mon.click();
  await expect(mon.getByTestId('slot-filled')).toHaveCount(1);

  // Nothing armed → tapping the day toggles the expanded editing panel, where
  // "Clear day" appears and wipes the day in one tap.
  await expect(mon.getByTestId('clear-day')).toHaveCount(0);
  await mon.click();
  await expect(mon.getByTestId('clear-day')).toBeVisible();
  await mon.getByTestId('clear-day').click();
  await expect(mon.getByTestId('slot-filled')).toHaveCount(0);
});

test('palette: Browse loads capped, type-ahead searches the full set, switch toggles, add-a-cook grows the pool', async ({
  page,
}) => {
  await routeFeeds(page);
  await page.goto('/meals.html'); // signed out → Browse is the default source

  // Browse populates the palette, but the display is BOUNDED so it can't run
  // down half the page; the routed fixtures exceed the cap, so a hint shows the
  // total and points at the filter.
  const chips = page.getByTestId('palette-chip');
  await expect(chips.first()).toBeVisible();
  const initialCount = await chips.count();
  expect(initialCount).toBeGreaterThan(0);
  expect(initialCount).toBeLessThanOrEqual(10);
  // The pager hint shows the current window ("Showing 1–10 of N") with arrows.
  await expect(page.getByTestId('palette-hint')).toContainText(/Showing 1[–-]\d+ of \d+/);

  // Forward arrow advances to the next page (a browser can cycle the set).
  await page.getByTestId('palette-next').click();
  await expect(page.getByTestId('palette-hint')).toContainText(/Showing 11[–-]\d+ of \d+/);
  // Back arrow returns to the first page.
  await page.getByTestId('palette-prev').click();
  await expect(page.getByTestId('palette-hint')).toContainText(/Showing 1[–-]\d+ of \d+/);

  // Type-ahead searches the whole loaded set (beyond the capped display); while
  // filtering, the pager hides (the query already narrows).
  const filter = page.getByTestId('palette-filter');
  await filter.fill('zzzznomatch');
  await expect(chips).toHaveCount(0);
  await filter.fill('Ham');
  await expect(chips.first()).toBeVisible();
  await expect(page.getByTestId('palette-next')).toBeHidden();
  await filter.fill('');

  // Source switch: Browse active by default; clicking My Cookbook toggles it.
  await expect(page.getByTestId('source-browse')).toHaveClass(/src-btn--active/);
  await page.getByTestId('source-cookbook').click();
  await expect(page.getByTestId('source-cookbook')).toHaveClass(/src-btn--active/);
  await expect(page.getByTestId('source-browse')).not.toHaveClass(/src-btn--active/);

  // Back to Browse; add-a-cook grows the underlying pool — visible via the hint
  // total, since the displayed list stays capped.
  await page.getByTestId('source-browse').click();
  await expect(chips.first()).toBeVisible();
  const totalOf = async (): Promise<number> => {
    const t = (await page.getByTestId('palette-hint').textContent()) ?? '';
    const m = /of (\d+)/.exec(t);
    return m ? Number(m[1]) : 0;
  };
  const beforeTotal = await totalOf();
  await page.getByTestId('palette-handle-input').fill('rdur.dev');
  await page.getByTestId('palette-handle-add').click();
  await expect.poll(totalOf).toBeGreaterThan(beforeTotal);
});

// Phase 4: cook-search typeahead on the add-a-cook input. Typing suggests
// accounts (AppView); picking one adds that cook's recipes to the palette pool
// via the same loadHandlePalette path the Add button uses.
const paletteTotal = async (page: Page): Promise<number> => {
  const t = (await page.getByTestId('palette-hint').textContent()) ?? '';
  const m = /of (\d+)/.exec(t);
  return m ? Number(m[1]) : 0;
};

test('add-a-cook typeahead: picking a suggestion grows the palette pool (wiring)', async ({
  page,
}) => {
  await routeFeeds(page);
  // A more-specific typeahead route registered after routeFeeds — Playwright
  // matches the most-recently-added handler first, so this wins over the
  // public.api.bsky.app/** catch-all for the typeahead URL.
  await page.route(/searchActorsTypeahead/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        actors: [{ did: 'did:plc:handleadd', handle: 'cheftest.bsky.social', displayName: 'Chef Test' }],
      }),
    });
  });
  await page.goto('/meals.html'); // Browse is the default source, populates the palette

  const chips = page.getByTestId('palette-chip');
  await expect(chips.first()).toBeVisible();
  const beforeTotal = await paletteTotal(page);

  // Type a partial into add-a-cook → the AppView suggestion appears.
  await page.getByTestId('palette-handle-input').fill('ch');
  const options = page.locator('[role=option]');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('cheftest.bsky.social');

  // Pick it → that cook's recipes join the pool (total grows).
  await options.first().click();
  await expect.poll(() => paletteTotal(page)).toBeGreaterThan(beforeTotal);
});

test('planner: setting a start date lays the calendar out on real dates', async ({ page }) => {
  await seedPalette(page);
  await page.goto('/meals.html');

  // Place Lasagna on Monday so the calendar renders.
  await page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' }).click();
  await page.getByTestId('week-row').first().getByTestId('day-slot').first().click();
  // Anchor the first Monday → the week label becomes a real date range.
  await page.getByTestId('plan-start-date').fill('2026-07-13');
  await expect(page.getByTestId('cal-week').first()).toContainText('Jul 13');
});

test('shared view: ?mealplan=&user= renders a read-only, dated calendar linking each meal', async ({
  page,
}) => {
  const OWNER = 'did:plc:planowner00000000000000';
  await page.route('https://plc.directory/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: OWNER,
        service: [
          { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.test' },
        ],
      }),
    }),
  );
  await page.route('https://pds.test/**', async (route) => {
    if (new URL(route.request().url()).pathname.includes('getRecord')) {
      const value = {
        $type: 'app.arecipe.mealPlan',
        name: 'Shared Week',
        startDate: '2026-07-13',
        createdAt: '2026-07-10T00:00:00.000Z',
        updatedAt: '2026-07-10T00:00:00.000Z',
        weeks: [
          {
            repeat: 1,
            days: [
              {
                recipe: { uri: 'at://did:plc:cook/exchange.recipe.recipe/lasagna', cid: 'bafylasagna' },
                name: 'Lasagna',
              },
              ...Array.from({ length: 6 }, () => ({})),
            ],
          },
        ],
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ uri: `at://${OWNER}/app.arecipe.mealPlan/plan-1`, value }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
  });

  await page.goto(`/meals.html?mealplan=plan-1&user=${encodeURIComponent(OWNER)}`);

  // The shared, read-only surface: the plan titled by its DATE RANGE (not the
  // generic name) + calendar, and NO planner.
  await expect(page.getByTestId('shared-plan')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Jul 13 – Jul 19' })).toBeVisible();
  await expect(page.getByTestId('palette')).toHaveCount(0);
  await expect(page.getByTestId('builder')).toHaveCount(0);

  // Anchored on 2026-07-13 → the week label carries real dates.
  await expect(page.getByTestId('cal-week').first()).toContainText('Jul 13');

  // Each placed meal links to its recipe.
  const meal = page.getByTestId('shared-meal').filter({ hasText: 'Lasagna' });
  await expect(meal).toHaveCount(1);
  await expect(meal).toHaveAttribute('href', /recipe\.html\?u=/);
});

test('shared view: a link without a user param explains what is missing', async ({ page }) => {
  await page.goto('/meals.html?mealplan=plan-1');
  await expect(page.getByTestId('shared-plan')).toContainText('needs a “user”', { timeout: 15_000 });
});

test('the planner header links to the "My plans" subpage', async ({ page }) => {
  await page.goto('/meals.html');
  await expect(page.getByTestId('my-plans')).toHaveAttribute('href', /meals\.html\?plans$/);
});

test('published-plans subpage: signed out, it invites sign-in and offers a back link', async ({
  page,
}) => {
  await page.goto('/meals.html?plans');
  await expect(page.getByTestId('published-plans')).toContainText('Sign in', { timeout: 15_000 });
  await expect(page.getByTestId('plans-back')).toHaveAttribute('href', /meals\.html$/);
});

test('taste preference: a "never" cuisine hides matching palette recipes (Meals)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'taste-preference',
      JSON.stringify({ only: { cuisine: [], category: [] }, never: { cuisine: ['mexican'], category: [] } }),
    );
  });
  await seedPalette(page, [
    { uri: 'at://did:plc:cook/exchange.recipe.recipe/lasagna', cid: 'bafylasagna', name: 'Lasagna', cuisine: 'italian' },
    { uri: 'at://did:plc:cook/exchange.recipe.recipe/tacos', cid: 'bafytacos', name: 'Tacos', cuisine: 'mexican' },
  ]);
  await page.goto('/meals.html');
  await expect(page.getByTestId('palette-chip').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' })).toHaveCount(1);
  // "Never: Mexican" hides the taco chip from the placeable palette.
  await expect(page.getByTestId('palette-chip').filter({ hasText: 'Tacos' })).toHaveCount(0);
});

test('publish offers a "Reset on publish" checkbox, checked by default', async ({ page }) => {
  await seedPalette(page);
  await page.goto('/meals.html');
  const box = page.getByTestId('reset-on-publish');
  await expect(box).toBeVisible();
  await expect(box).toBeChecked();
});
