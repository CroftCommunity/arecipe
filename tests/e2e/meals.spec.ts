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

test('plan.html mounts the shared shell and the plan builder (wiring)', async ({ page }) => {
  await page.goto('/plan.html');

  // Shell chrome came from mountShell: the shared topbar wordmark + tab bar.
  await expect(page.locator('header.topbar h1.wordmark')).toHaveText('arecipe');
  await expect(page.getByTestId('tab-browse')).toBeVisible();

  // Plan is the active tab and the page's own content is the builder.
  await expect(page.getByTestId('tab-plan')).toHaveClass(/tab--active/);
  await expect(page.getByTestId('builder')).toBeVisible();
});

test('meals.html mounts the Menu (published plans) view (wiring)', async ({ page }) => {
  await page.goto('/meals.html');

  // Menu is the active tab; the published-plans surface is the page content
  // (signed out it invites sign-in — asserted in its own test below).
  await expect(page.getByTestId('tab-meals')).toHaveClass(/tab--active/);
  await expect(page.getByTestId('published-plans')).toBeVisible();
});

test('the mobile bottom bar fits a narrow phone without horizontal overflow (Phase 2 risk)', async ({
  page,
}) => {
  // The mobile tab bar is a no-wrap flex row, so the tabs must still fit a
  // small phone. iPhone SE width.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/meals.html');

  // The four primary destinations are present and the active one is Menu.
  // Reference is desktop-only: still in the DOM (it IS a tab on wide screens)
  // but hidden from the mobile thumb row — reached via the open-book quick
  // links on recipe/editor/Alchemy instead.
  for (const id of ['tab-browse', 'tab-cookbook', 'tab-plan', 'tab-meals']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('tab-reference')).toBeHidden();
  await expect(page.getByTestId('tab-meals')).toHaveClass(/tab--active/);

  // The tab bar must not overflow its own width (no clipped/scrolled tabs).
  const overflow = await page.locator('nav.tabs').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1); // ≤1px sub-pixel tolerance
});

test('tap-to-place: arm a recipe, place it on a day, persist across reload, clear, add a week', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/plan.html');

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

// Reset-surface v2 (D5): the meals reset is the SAME shared icon button as the
// toolbar reset — a labelled, icon-only counterclockwise arrow. The confirm gate
// is unchanged (covered below); this only pins the control's shape.
test('reset control is the shared reset icon button (labelled, icon-only)', async ({ page }) => {
  await seedPalette(page);
  await page.goto('/plan.html');
  const reset = page.getByTestId('reset-plan');
  await expect(reset).toBeVisible();
  await expect(reset).toHaveAttribute('aria-label', 'Reset plan');
  await expect(reset).toHaveAttribute('title', 'Reset plan');
  // Icon-only via the shared helper: the class + inline svg, no text label.
  expect(await reset.evaluate((n) => n.classList.contains('reset-icon-btn'))).toBe(true);
  expect(await reset.evaluate((n) => n.querySelector('svg') !== null)).toBe(true);
  await expect(reset).toHaveText('');
});

test('reset: clears the plan back to one empty week (inline confirm; cancel is safe)', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/plan.html');

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
});

test('repeat planned weeks: duplicates the whole plan (meals and all) instead of adding a blank week', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/plan.html');

  // Place Lasagna on Monday (day 0) of week 1.
  await page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' }).click();
  await page.getByTestId('week-row').first().getByTestId('day-slot').first().click();
  await expect(
    page.getByTestId('week-row').first().getByTestId('slot-filled'),
  ).toHaveText('Lasagna');

  // "Repeat weeks" appends a copy of the current plan (week 1 → 1 + 2),
  // and the copy carries the same placed meal.
  await page.getByTestId('repeat-weeks').click();
  await expect(page.getByTestId('week-row')).toHaveCount(2);
  await expect(page.getByTestId('week-row').nth(1).getByTestId('slot-filled')).toHaveText(
    'Lasagna',
  );
});

// Unified view: the planner IS the calendar — week and day headers carry the
// real dates, so the old standalone "Calendar" preview (and its empty-state
// placeholder) is gone from the plan page. The shared read-only view keeps its
// own calendar (covered below).
test('plan page has no separate calendar preview section', async ({ page }) => {
  await seedPalette(page);
  await page.goto('/plan.html');
  await expect(page.getByTestId('builder')).toBeVisible();
  await expect(page.getByTestId('calendar')).toHaveCount(0);
  await expect(page.getByTestId('calendar-empty')).toHaveCount(0);
  await expect(page.getByTestId('cal-week')).toHaveCount(0);
  // The start-date control moved up: it now lives inside the builder, ABOVE the
  // first week block.
  const startInBuilder = page.getByTestId('builder').getByTestId('plan-start-date');
  await expect(startInBuilder).toBeVisible();
  const startY = (await startInBuilder.boundingBox())?.y ?? Infinity;
  const week1Y = (await page.getByTestId('week-row').first().boundingBox())?.y ?? 0;
  expect(startY).toBeLessThan(week1Y);
});

test('grounded weeks: headers carry the date span, day cards the real dates, continuing week over week', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/plan.html');

  await page.getByTestId('plan-start-date').fill('2026-08-10');
  // Week header reads "Week 1 (Aug 10 – Aug 16)".
  await expect(page.locator('.week-name').first()).toHaveText('Week 1 (Aug 10 – Aug 16)');
  // Day cards stamp the day of week AND the date: "Mon 8/10", "Tue 8/11".
  const week1 = page.getByTestId('week-row').first();
  await expect(week1.getByTestId('day-slot').nth(0)).toContainText('Mon 8/10');
  await expect(week1.getByTestId('day-slot').nth(1)).toContainText('Tue 8/11');
  await expect(week1.getByTestId('day-slot').nth(6)).toContainText('Sun 8/16');

  // A second week continues from the start (+7 days), no barrier between weeks.
  await page.getByTestId('add-week').click();
  await expect(page.locator('.week-name').nth(1)).toHaveText('Week 2 (Aug 17 – Aug 23)');
  await expect(
    page.getByTestId('week-row').nth(1).getByTestId('day-slot').first(),
  ).toContainText('Mon 8/17');

  // Clearing the anchor returns the headers to the abstract labels.
  await page.getByTestId('plan-start-date').fill('');
  await expect(page.locator('.week-name').first()).toHaveText('Week 1');
  await expect(week1.getByTestId('day-slot').first()).toContainText('Mon');
  await expect(week1.getByTestId('day-slot').first()).not.toContainText('8/10');
});

test('start picker snaps any chosen date back to that week’s Monday and syncs the URL', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/plan.html');

  // Place a recipe FIRST — re-anchoring must never wipe placements.
  await page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' }).click();
  await page.getByTestId('week-row').first().getByTestId('day-slot').nth(1).click();
  await expect(page.getByTestId('slot-filled')).toHaveText('Lasagna');

  // Pick a Wednesday — the input normalizes to that week's Monday.
  await page.getByTestId('plan-start-date').fill('2026-08-12');
  await expect(page.getByTestId('plan-start-date')).toHaveValue('2026-08-10');
  await expect(page.locator('.week-name').first()).toHaveText('Week 1 (Aug 10 – Aug 16)');

  // Non-destructive shift: the placed recipe survives the re-anchor.
  await expect(page.getByTestId('slot-filled')).toHaveText('Lasagna');

  // The chosen start rides the URL (?start=) for shareable/refreshable state…
  await expect(page).toHaveURL(/[?&]start=2026-08-10/);

  // …and persists locally: a plain reload retains both the date and the meal.
  await page.goto('/plan.html');
  await expect(page.getByTestId('plan-start-date')).toHaveValue('2026-08-10');
  await expect(page.getByTestId('slot-filled')).toHaveText('Lasagna');
});

test('?start= in the URL grounds the plan on load (snapped to Monday)', async ({ page }) => {
  await seedPalette(page);
  // A Saturday in the query — the page adopts its week's Monday.
  await page.goto('/plan.html?start=2026-08-15');
  await expect(page.getByTestId('plan-start-date')).toHaveValue('2026-08-10');
  await expect(page.locator('.week-name').first()).toHaveText('Week 1 (Aug 10 – Aug 16)');
});

test('today’s day card carries the is-today highlight', async ({ page }) => {
  await seedPalette(page);
  await page.goto('/plan.html');

  // Anchor the plan on THIS week's Monday so today is inside week 1.
  const today = new Date().toISOString().slice(0, 10);
  const utcDay = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
  const dayIndex = (utcDay + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - dayIndex);
  await page.getByTestId('plan-start-date').fill(monday.toISOString().slice(0, 10));

  const days = page.getByTestId('week-row').first().getByTestId('day-slot');
  await expect(days.nth(dayIndex)).toHaveClass(/is-today/);
  // Exactly one card is "today".
  await expect(page.locator('.day.is-today')).toHaveCount(1);
});

// Week-actions layout: "+ Add" then "⧉ Repeat" left-aligned in the row, with
// the plan Reset moved down into the same row's right-aligned spot (it used to
// live in the top controls row beside "Recipes per day").
test('week-actions: Add then Repeat on the left, Reset on the right of the same row', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/plan.html');

  // Add + Repeat sit together on the left, Add first.
  const leftBtns = page.locator('.week-actions-left button');
  await expect(leftBtns.nth(0)).toHaveAttribute('data-testid', 'add-week');
  await expect(leftBtns.nth(1)).toHaveAttribute('data-testid', 'repeat-weeks');

  // Reset moved down into the week-actions row (no longer in the controls row).
  await expect(page.locator('.week-actions [data-testid="reset-plan"]')).toBeVisible();
  await expect(page.locator('.meals-controls [data-testid="reset-plan"]')).toHaveCount(0);
});

test('drag (desktop): drag a palette chip onto a day places it; drag a filled slot moves it', async ({
  page,
}) => {
  await seedPalette(page);
  await page.goto('/plan.html');

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
  await page.goto('/plan.html');

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
  await expect(monAfter).toContainText('Lasagna');
  await expect(monAfter).toContainText('Tacos');
});

test('meals/day cap: lowering it to 1 blocks adding a second meal', async ({ page }) => {
  await seedPalette(page);
  await page.goto('/plan.html');

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

test('a placed meal is labelled with the recipe’s own category ("Breakfast: …")', async ({ page }) => {
  await seedPalette(page, [
    { uri: 'at://did:plc:cook/exchange.recipe.recipe/oatmeal', cid: 'bafyo', name: 'Oatmeal', category: 'breakfast' },
  ]);
  await page.goto('/plan.html');

  await page.getByTestId('palette-chip').filter({ hasText: 'Oatmeal' }).click();
  await page.getByTestId('week-row').first().getByTestId('day-slot').first().click();

  // The placed slot reads "Breakfast: Oatmeal" (label from recipeCategory).
  await expect(page.getByTestId('slot-filled')).toHaveText('Breakfast: Oatmeal');
});

test('mobile: expand a day by its header, then Clear day removes its meals', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await seedPalette(page);
  await page.goto('/plan.html');

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

test('palette: Browse loads capped, type-ahead searches the full set, switch toggles', async ({
  page,
}) => {
  await routeFeeds(page);
  await page.goto('/plan.html'); // signed out → Browse is the default source

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

  // Add-a-cook moved to the Browse tab — the palette carries no handle input.
  await expect(page.getByTestId('palette-handle-input')).toHaveCount(0);
  await expect(page.getByTestId('palette-handle-add')).toHaveCount(0);
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

test('Menu (published), signed out: invites sign-in and nudges to Plan', async ({ page }) => {
  // Menu is the default meals.html view and its own top-level tab. Signed out
  // it can't list plans, so it invites sign-in AND offers a way straight to the
  // Plan builder (so a new/signed-out cook doesn't hit a dead end).
  await page.goto('/meals.html');
  await expect(page.getByTestId('published-plans')).toContainText('Sign in', { timeout: 15_000 });
  await expect(page.getByTestId('start-planning')).toHaveAttribute('href', /plan\.html$/);
});

test('edit route lives on plan.html; signed out it invites sign-in and links back to Menu', async ({
  page,
}) => {
  // ?edit=<rkey> is the staged-edit entry point (the builder) — signed-in only
  // (publishing back needs the account). Signed out it explains and offers the
  // way back to Menu instead of mounting the planner.
  await page.goto('/plan.html?edit=some-rkey');
  await expect(page.getByTestId('edit-plan')).toContainText('Sign in', { timeout: 15_000 });
  await expect(page.getByTestId('plans-back')).toHaveAttribute('href', /meals\.html$/);
});

test('a staged edit copy never becomes the plain planner working plan', async ({ page }) => {
  // A staged copy (editOf set) exists in the local store, newer than anything
  // else. The plain planner must NOT adopt it — otherwise its write-through
  // would live-edit the published record. It opens a fresh working plan instead.
  await seedPalette(page);
  await page.addInitScript(() => {
    const staged = {
      id: 'staged-1',
      name: 'My meal plan',
      editOf: 'pub-1',
      mealsPerDay: 3,
      updatedAt: new Date().toISOString(),
      weeks: [
        {
          repeat: 1,
          days: [
            { meals: [{ recipe: { uri: 'at://did:plc:cook/exchange.recipe.recipe/x', cid: 'bafyx', name: 'Staged Dish' } }] },
            ...Array.from({ length: 6 }, () => ({ meals: [] })),
          ],
        },
      ],
    };
    try {
      localStorage.setItem('arecipe.mealplans.v1', JSON.stringify({ 'staged-1': staged }));
    } catch {
      /* private mode */
    }
  });
  await page.goto('/plan.html');
  await expect(page.getByTestId('builder')).toBeVisible();
  await expect(page.getByTestId('slot-filled')).toHaveCount(0); // fresh plan, not the staged copy
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
  await page.goto('/plan.html');
  await expect(page.getByTestId('palette-chip').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' })).toHaveCount(1);
  // "Never: Mexican" hides the taco chip from the placeable palette.
  await expect(page.getByTestId('palette-chip').filter({ hasText: 'Tacos' })).toHaveCount(0);
});

test('publish offers a "Reset on publish" checkbox, checked by default', async ({ page }) => {
  await seedPalette(page);
  await page.goto('/plan.html');
  const box = page.getByTestId('reset-on-publish');
  await expect(box).toBeVisible();
  await expect(box).toBeChecked();
});

test('planner start-date defaults to the next Monday for a fresh plan (D7)', async ({ page }) => {
  await page.goto('/plan.html');
  const value = await page.getByTestId('plan-start-date').inputValue();
  expect(value).not.toBe('');
  // The default is always a Monday (UTC day 1).
  expect(new Date(`${value}T00:00:00Z`).getUTCDay()).toBe(1);
});

test('calendar sync chip: hidden by default, shown top-right on the Menu page when enabled (D9)', async ({
  page,
}) => {
  await page.goto('/meals.html');
  await expect(page.getByTestId('published-plans')).toBeVisible();
  await expect(page.getByTestId('calendar-sync-status')).toBeHidden();

  // Enable the device-local feature and reload — the chip + Resync appear in
  // the Menu page's header, hugging the right edge.
  await page.addInitScript(() =>
    localStorage.setItem(
      'arecipe.calendar-publish.v1',
      JSON.stringify({ enabled: true, repo: 'me/cal', path: 'meals.ics' }),
    ),
  );
  await page.reload();
  const chip = page.getByTestId('calendar-sync-status');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('Calendar');
  await expect(page.getByTestId('calendar-resync')).toBeVisible();
  const [chipBox, headerBox] = await Promise.all([
    chip.boundingBox(),
    page.locator('.meals-header').boundingBox(),
  ]);
  expect(chipBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  // Upper right: the chip's right edge sits at the header's right edge.
  expect(chipBox!.x + chipBox!.width).toBeGreaterThan(headerBox!.x + headerBox!.width - 8);
});

test('calendar sync chip no longer rides the Plan builder header (moved to Menu)', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'arecipe.calendar-publish.v1',
      JSON.stringify({ enabled: true, repo: 'me/cal', path: 'meals.ics' }),
    ),
  );
  await page.goto('/plan.html');
  await expect(page.getByTestId('builder')).toBeVisible();
  await expect(page.getByTestId('calendar-sync-status')).toHaveCount(0);
});
