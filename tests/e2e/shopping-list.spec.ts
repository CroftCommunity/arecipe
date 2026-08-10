// Shopping list — e2e wiring against the BUILT bundle
// (plans/2026-07-18-1-plan-shopping-list.md, Phase 5). Hermetic: the owner DID,
// the plan record, and each recipe record are routed to fixtures so both views
// build offline. Covers a deliberate roll-up (same ingredient across two
// recipes), a flagged straggler, a ×2 week repeat, an unresolvable recipe, and
// the action's presence on the auth-free public plan view.
import { expect, test, type Page, type Route } from '@playwright/test';

const OWNER = 'did:plc:planowner00000000000000';

const recipeValue = (name: string, ingredients: string[]) => ({
  $type: 'exchange.recipe.recipe',
  name,
  text: `${name} recipe`,
  ingredients,
  instructions: ['Do the thing.'],
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
});

// rkey → ingredients (missing rkey → 404, i.e. an unresolvable recipe).
const RECIPES: Record<string, { name: string; ingredients: string[] }> = {
  lasagna: { name: 'Lasagna', ingredients: ['2 cups flour', '2 cups', 'cucumber', '2 pinches salt'] },
  salad: { name: 'Salad', ingredients: ['1 cup flour', 'cucumber'] },
};

const didDoc = (did: string) => ({
  id: did,
  service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.test' }],
});

/** One dated plan: a ×2 week with Lasagna (Mon), Salad (Tue), and an
 * unresolvable "Ghost Stew" (Wed). */
const planValue = () => ({
  $type: 'app.arecipe.mealPlan',
  name: 'My meal plan',
  startDate: '2026-07-13',
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  weeks: [
    {
      repeat: 2,
      days: [
        { meals: [{ recipe: { uri: 'at://did:plc:cook/exchange.recipe.recipe/lasagna', cid: 'bafylasagna' }, name: 'Lasagna' }] },
        { meals: [{ recipe: { uri: 'at://did:plc:cook/exchange.recipe.recipe/salad', cid: 'bafysalad' }, name: 'Salad' }] },
        { meals: [{ recipe: { uri: 'at://did:plc:cook/exchange.recipe.recipe/ghost', cid: 'bafyghost' }, name: 'Ghost Stew' }] },
        {}, {}, {}, {},
      ],
    },
  ],
});

const routeRecipeGetRecord = async (route: Route): Promise<void> => {
  const url = new URL(route.request().url());
  const collection = url.searchParams.get('collection');
  const rkey = url.searchParams.get('rkey') ?? '';
  if (collection === 'app.arecipe.mealPlan') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ uri: `at://${OWNER}/app.arecipe.mealPlan/${rkey}`, value: planValue() }),
    });
  }
  if (collection === 'exchange.recipe.recipe') {
    const rec = RECIPES[rkey];
    if (rec === undefined) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uri: `at://did:plc:cook/exchange.recipe.recipe/${rkey}`,
        cid: `bafy${rkey}`,
        value: recipeValue(rec.name, rec.ingredients),
      }),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
};

const routeAll = async (page: Page): Promise<void> => {
  await page.route('https://plc.directory/**', (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(didDoc(did)) });
  });
  await page.route('https://pds.test/**', routeRecipeGetRecord);
  await page.route('https://public.api.bsky.app/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  );
};

test('public plan view: the shopping list builds both views (roll-up, flag, ×2 repeat, unavailable)', async ({
  page,
}) => {
  await routeAll(page);
  await page.goto(`/meals.html?mealplan=plan-1&user=${encodeURIComponent(OWNER)}`);

  // The action is present on the auth-free public plan view.
  const open = page.getByTestId('shopping-list-open');
  await expect(open).toBeVisible({ timeout: 15_000 });
  await open.click();

  const panel = page.getByTestId('shopping-list-panel');
  await expect(panel).toBeVisible();

  // By-recipe (default tab): each recipe once with its ×N; the unparseable line
  // is flagged; the unresolvable recipe degrades to a named, flagged note.
  const lasagna = page.getByTestId('shopping-recipe-section').filter({ hasText: 'Lasagna ×2' });
  await expect(lasagna).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('shopping-flagged').filter({ hasText: '2 cups' })).toBeVisible();
  await expect(
    page.getByTestId('shopping-recipe-section').filter({ hasText: 'Ghost Stew' }),
  ).toContainText('ingredients unavailable');

  // Combined: the roll-up (2 cups ×2 + 1 cup ×2 = 6 cups), the ×N bare count,
  // the as-listed straggler, and the unavailable recipe.
  await page.getByTestId('shopping-tab-combined').click();
  const combined = page.getByTestId('shopping-combined');
  await expect(combined).toContainText('flour — 6 cups');
  await expect(combined).toContainText('cucumber ×4');
  await expect(page.getByTestId('shopping-unavailable')).toContainText('Ghost Stew');
  await expect(combined).toContainText('2 cups'); // the as-listed line

  // Download is offered as a markdown file.
  const download = page.getByTestId('shopping-download');
  await expect(download).toHaveAttribute('download', /shopping-.*\.md/);

  // Detail toggle on Combined → adds recipe attribution to each ingredient.
  const detail = page.getByTestId('shopping-detail-toggle');
  await expect(detail).toHaveText('Show sources');
  await detail.click();
  await expect(combined).toContainText('flour — 6 cups (from Lasagna, Salad)');

  // The SAME toggle, on By recipe, scales each recipe's amounts by its ×N.
  await page.getByTestId('shopping-tab-byrecipe').click();
  await expect(detail).toHaveText('Amounts ×N'); // label reflects the active tab
  await expect(lasagna).toContainText('4 cups flour'); // 2 cups × the ×2 repeat
});

test('staples are annotated (not shopped), items check off, AI shopper copies instructions', async ({
  page,
  context,
}) => {
  await routeAll(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Account-page prefs: salt is a staple; a standing AI-shopper instruction.
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'shopping-prefs',
        JSON.stringify({ staples: ['salt'], aiInstructions: 'prefer versions we have bought before' }),
      );
    } catch {
      /* private mode */
    }
  });
  await page.goto(`/meals.html?mealplan=plan-1&user=${encodeURIComponent(OWNER)}`);
  await page.getByTestId('shopping-list-open').click({ timeout: 15_000 });

  await page.getByTestId('shopping-tab-combined').click();
  const combined = page.getByTestId('shopping-combined');
  await expect(combined).toContainText('flour — 6 cups', { timeout: 15_000 });

  // Salt (the staple) is annotated "Assumed on hand", NOT a checkable shop line.
  const onHand = page.getByTestId('shopping-onhand');
  await expect(onHand).toContainText('salt');
  await expect(onHand).toContainText('on hand');

  // AI shopper: terse cart instructions with the custom block, minus the staple.
  const readClip = () => page.evaluate(() => navigator.clipboard.readText());
  await page.getByTestId('shopping-ai').click();
  let clip = await readClip();
  expect(clip).toContain('Add these grocery items to my shopping cart:');
  expect(clip).toContain('prefer versions we have bought before');
  expect(clip).toContain('flour — 6 cups');
  expect(clip).not.toContain('salt'); // staple excluded from the payload
  expect(clip.toLowerCase()).not.toContain('recipe'); // no arecipe/recipe framing

  // Check off "flour" in place → it drops from the next copy.
  await page.getByTestId('shopping-combined-line').filter({ hasText: 'flour' }).getByTestId('shopping-check').check();
  await page.getByTestId('shopping-ai').click();
  clip = await readClip();
  expect(clip).not.toContain('flour');
  expect(clip).toContain('cucumber'); // an unchecked item still shops
});

test('shopping panel fits a narrow phone without horizontal overflow', async ({ page }) => {
  await routeAll(page);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/meals.html?mealplan=plan-1&user=${encodeURIComponent(OWNER)}`);
  await page.getByTestId('shopping-list-open').click({ timeout: 15_000 });
  await expect(page.getByTestId('shopping-list-panel')).toBeVisible();
  // The document body must not scroll horizontally (mobile-first guard).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

// Undated plans select by expanded-week index instead of dates.
const PALETTE = [
  { uri: 'at://did:plc:cook/exchange.recipe.recipe/lasagna', cid: 'bafylasagna', name: 'Lasagna' },
  { uri: 'at://did:plc:cook/exchange.recipe.recipe/salad', cid: 'bafysalad', name: 'Salad' },
];

test('undated planner: the week selector narrows the shopping list', async ({ page }) => {
  await routeAll(page);
  await page.addInitScript((seed) => {
    try {
      localStorage.setItem('arecipe.meals.palette-seed', JSON.stringify(seed));
    } catch {
      /* private mode: palette stays empty */
    }
  }, PALETTE);
  await page.goto('/plan.html');

  // Place Lasagna in week 1, add a week, place Salad in week 2.
  await page.getByTestId('palette-chip').filter({ hasText: 'Lasagna' }).click();
  await page.getByTestId('week-row').first().getByTestId('day-slot').first().click();
  await page.getByTestId('add-week').click();
  await page.getByTestId('palette-chip').filter({ hasText: 'Salad' }).click();
  await page.getByTestId('week-row').nth(1).getByTestId('day-slot').first().click();

  // Clear the start date → the plan is undated → the shopping panel offers a
  // week selector (not date pickers).
  await page.getByTestId('plan-start-date').fill('');

  await page.getByTestId('shopping-list-open').click();
  await expect(page.getByTestId('shopping-week-from')).toBeVisible();

  // All weeks (default) → both recipes.
  await expect(page.getByTestId('shopping-recipe-section').filter({ hasText: 'Lasagna' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('shopping-recipe-section').filter({ hasText: 'Salad' })).toBeVisible();

  // Narrow to week 2 only → just Salad remains.
  await page.getByTestId('shopping-week-from').selectOption('2');
  await page.getByTestId('shopping-week-to').selectOption('2');
  await expect(page.getByTestId('shopping-recipe-section').filter({ hasText: 'Salad' })).toBeVisible();
  await expect(page.getByTestId('shopping-recipe-section').filter({ hasText: 'Lasagna' })).toHaveCount(0);
});
