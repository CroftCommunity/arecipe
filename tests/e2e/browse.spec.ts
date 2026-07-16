// Browse controls (view modes, photos-only, label filters). Hermetic via
// routed fixtures, patterned on starter.spec.ts: the four starter authors are
// routed so only arecipe.bsky.social serves records — the mixed fixture (four
// recipes, one image-less, varied cuisine/category/diet) — and the other three
// return empty lists, so the feed IS the mixed fixture. Reused by Phases 5/7.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');
const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

// Handles/DIDs must match src/recipes/starter.ts. Only arecipe serves records.
const AUTHORS = [
  { did: 'did:plc:spfl4xaktvvchr2cqp2r2xvp', pds: 'https://pds0.test', records: true },
  { did: 'did:plc:26tsx5juuss4yealylyfbj4h', pds: 'https://pds1.test', records: false },
  { did: 'did:plc:4cx7ts7lqgjtsfquo53qo3sz', pds: 'https://pds2.test', records: false },
  { did: 'did:plc:vspq46f5zmrlesaszlyfliy2', pds: 'https://pds3.test', records: false },
];

const routeMixedFeed = async (page: Page): Promise<void> => {
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    service: { serviceEndpoint: string }[];
  };
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    const author = AUTHORS.find((a) => a.did === did);
    if (author === undefined) return route.fulfill({ status: 404, body: '{}' });
    const doc = { ...template, id: author.did, service: [{ ...template.service[0]!, serviceEndpoint: author.pds }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  for (const author of AUTHORS) {
    await page.route(`${author.pds}/**`, async (route) => {
      const body = author.records
        ? atprotoFixture('listRecords-browse-mixed.json')
        : JSON.stringify({ records: [] });
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
  }
};

// D7: photos-only + Meal/Cuisine facets + reset all live inside ONE "Filters ▾"
// disclosure. Open it before touching those controls.
const openFilters = async (page: Page): Promise<void> => {
  const dd = page.getByTestId('filters-dd');
  const open = await dd.evaluate((node) => (node as HTMLDetailsElement).open);
  if (!open) await dd.locator('summary').click();
};

test('photos-only hides the image-less recipe and updates the count (wiring)', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  // Unfiltered: all four recipes, the plain count.
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await expect(page.getByTestId('recipes-status')).toHaveText('4 recipes');

  // Photos only ON: the one image-less recipe (Minestrone) drops out.
  await openFilters(page);
  await page.getByTestId('photos-only').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
  await expect(page.getByTestId('recipes-status')).toContainText('3 of 4 recipes');

  // Photos only OFF: back to all four and the plain count.
  await page.getByTestId('photos-only').uncheck();
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await expect(page.getByTestId('recipes-status')).toHaveText('4 recipes');
});

test('reset filters clears active browse filters; status shows the honest count (wiring)', async ({
  page,
}) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  // No browse filter → no visible reset control anywhere.
  await expect(page.getByTestId('reset-filters')).toBeHidden();

  // Apply a filter (photos-only lives in the popover; open it to toggle); the
  // status reads the honest "N of M recipes".
  await openFilters(page);
  await page.getByTestId('photos-only').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
  await expect(page.getByTestId('recipes-status')).toContainText('3 of 4 recipes');

  // Reset-surface v2 (D4): the reset control shows in the count block, in sight,
  // WITHOUT the Filters popover — close it and the reset is still there.
  await page.getByTestId('filters-dd').locator('summary').click(); // close the popover
  await expect(page.getByTestId('filters-dd')).toHaveJSProperty('open', false);
  await expect(page.getByTestId('reset-filters')).toBeVisible();

  // One tap: full list back, photos-only unchecked, control hidden again.
  await page.getByTestId('reset-filters').click();
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await expect(page.getByTestId('photos-only')).not.toBeChecked();
  await expect(page.getByTestId('reset-filters')).toBeHidden();
});

test('view mode: Tiles is default; Details renders rows; persists (wiring)', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  // Default is Tiles (a grid), not rows.
  await expect(page.locator('.recipe-grid')).toBeVisible();
  await expect(page.locator('.recipe-rows')).toHaveCount(0);

  // Switch to Details: rows replace the grid, same four recipes.
  await page.getByTestId('view-details').click();
  await expect(page.locator('.recipe-rows')).toBeVisible();
  await expect(page.locator('.recipe-grid')).toHaveCount(0);
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);

  // The mode persists across reload.
  await page.reload();
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.recipe-rows')).toBeVisible();
});

test('Details view composes with photos-only', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('view-details').click();
  await openFilters(page);
  await page.getByTestId('photos-only').check();
  await expect(page.locator('.recipe-rows')).toBeVisible();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3); // image-less row dropped
});

test('photos-only choice persists across reload', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await openFilters(page);
  await page.getByTestId('photos-only').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);

  await page.reload();
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await openFilters(page);
  await expect(page.getByTestId('photos-only')).toBeChecked();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
});

// Facet filtering. Mixed fixture: Greek Salad (greek/dinner), American Pancakes
// (american/breakfast), Italian Minestrone (italian/dinner), Greek Vegan Lunch
// Bowl (greek/lunch).
// D7: Meal + Cuisine are flat checkbox groups inside the single Filters popover
// (no per-dimension dropdown). Open the popover, then tick values.
test('Meal facet narrows to matching recipes and updates the count (wiring)', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await openFilters(page);
  await page.locator('input[data-dimension=category][data-value=dinner]').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(2); // Greek Salad + Minestrone
  await expect(page.getByTestId('recipes-status')).toContainText('2 of 4 recipes');
});

test('OR within a dimension; multi-select keeps the Filters popover open', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await openFilters(page);
  await page.locator('input[data-dimension=category][data-value=dinner]').check();
  // The popover must stay open so a second selection is cumulative.
  await page.locator('input[data-dimension=category][data-value=breakfast]').check();
  await expect(page.getByTestId('filters-dd')).toHaveJSProperty('open', true);
  await expect(page.getByTestId('recipe-item')).toHaveCount(3); // 2 dinner + 1 breakfast
});

test('AND across dimensions: cuisine greek + meal lunch → one recipe', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await openFilters(page); // both dimensions share one popover
  await page.locator('input[data-dimension=cuisine][data-value=greek]').check();
  await page.locator('input[data-dimension=category][data-value=lunch]').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(1); // Greek Vegan Lunch Bowl
  await expect(page.getByTestId('recipes-status')).toContainText('1 of 4 recipes');
});

test('facet selections persist across reload', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await openFilters(page);
  await page.locator('input[data-dimension=category][data-value=dinner]').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(2);

  await page.reload();
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(2);
  await openFilters(page);
  await expect(page.locator('input[data-dimension=category][data-value=dinner]')).toBeChecked();
});

// Phase 4e: alternative versions of one dish collapse to a single badged card
// linking to the compare grid; single recipes are untouched.
const routeVersionsFeed = async (page: Page): Promise<void> => {
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    service: { serviceEndpoint: string }[];
  };
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    const author = AUTHORS.find((a) => a.did === did);
    if (author === undefined) return route.fulfill({ status: 404, body: '{}' });
    const doc = { ...template, id: author.did, service: [{ ...template.service[0]!, serviceEndpoint: author.pds }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  for (const author of AUTHORS) {
    await page.route(`${author.pds}/**`, async (route) => {
      const body = author.records ? atprotoFixture('listRecords-versions.json') : JSON.stringify({ records: [] });
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
  }
};

test('two versions of a dish collapse to one badged card linking to the grid (Phase 4e)', async ({ page }) => {
  await routeVersionsFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId('version-badge')).toHaveText('2 versions');
  await expect(page.getByTestId('recipe-item').first()).toHaveAttribute('href', /dish\.html\?key=banana-bread/);
});

// Phase 3: cook-search typeahead. Typing a partial into the handle box queries
// the AppView's searchActorsTypeahead and shows suggestions; picking one fills
// the handle and runs the existing find path (resolve → read that repo). Starter
// pack is disabled so the page lands on an empty search box, keeping the test
// focused on the typeahead → find wiring.
const disableStarters = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'starter-pack-disabled',
      JSON.stringify(['arecipe.bsky.social', 'rdur.dev', 'recipe.exchange', 'daffl.xyz']),
    );
  });
};

const routeCookTypeahead = async (page: Page): Promise<void> => {
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    service: { serviceEndpoint: string }[];
  };
  // The AppView origin serves BOTH the typeahead and resolveHandle — branch on path.
  await page.route('https://public.api.bsky.app/**', async (route) => {
    const url = route.request().url();
    if (url.includes('searchActorsTypeahead')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          actors: [
            { did: 'did:plc:cook1', handle: 'cheftest.bsky.social', displayName: 'Chef Test' },
          ],
        }),
      });
    }
    if (url.includes('resolveHandle')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ did: 'did:plc:cook1' }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('https://plc.directory/**', async (route) => {
    const doc = {
      ...template,
      id: 'did:plc:cook1',
      service: [{ ...template.service[0]!, serviceEndpoint: 'https://cookpds.test' }],
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  await page.route('https://cookpds.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: atprotoFixture('listRecords-browse-mixed.json'),
    });
  });
};

// D7: the cook lookup moved into the toolbar "+ Cook" inline panel; its input is
// `add-cook-input` and picking a suggestion runs the lookup → PREVIEW.
test('cook typeahead: typing suggests cooks; picking one previews their recipes (wiring)', async ({
  page,
}) => {
  await disableStarters(page);
  await routeCookTypeahead(page);
  await page.goto('/');
  // Open the "+ Cook" panel to reveal the lookup input.
  await page.getByTestId('add-cook').click();
  await expect(page.getByTestId('add-cook-input')).toBeVisible();

  // Type a partial handle → the AppView suggestion appears.
  await page.getByTestId('add-cook-input').fill('ch');
  const options = page.locator('[role=option]');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('cheftest.bsky.social');

  // Pick it → the lookup previews that cook's recipes + shows the follow bar.
  await options.first().click();
  await expect(page.getByTestId('preview-bar')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
});

test('cook typeahead does not fire below the minimum query length', async ({ page }) => {
  await disableStarters(page);
  let typeaheadCalls = 0;
  await page.route('https://public.api.bsky.app/**', async (route) => {
    if (route.request().url().includes('searchActorsTypeahead')) typeaheadCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actors: [] }) });
  });
  await page.goto('/');
  await page.getByTestId('add-cook').click();
  await page.getByTestId('add-cook-input').fill('c'); // one char — below minChars (2)
  await expect(page.locator('[role=option]')).toHaveCount(0);
  // Give any (erroneous) debounced request time to fire before asserting none did.
  await page.waitForTimeout(400);
  expect(typeaheadCalls).toBe(0);
});

test('taste preference: a "never" cuisine hides matching recipes app-wide (Browse)', async ({
  page,
}) => {
  // Seed a standing "Never show me: Greek" taste preference before the app boots.
  await page.addInitScript(() => {
    localStorage.setItem(
      'taste-preference',
      JSON.stringify({ only: { cuisine: [], category: [] }, never: { cuisine: ['greek'], category: [] } }),
    );
  });
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  // The two Greek recipes drop out; American + Italian remain.
  await expect(page.getByTestId('recipe-item')).toHaveCount(2);
  await expect(page.getByText('Greek Salad')).toHaveCount(0);
  await expect(page.getByText('Greek Vegan Lunch Bowl')).toHaveCount(0);
});

const routeManyRecipes = async (page: Page, n: number): Promise<void> => {
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    service: { serviceEndpoint: string }[];
  };
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    const author = AUTHORS.find((a) => a.did === did);
    if (author === undefined) return route.fulfill({ status: 404, body: '{}' });
    const doc = { ...template, id: author.did, service: [{ ...template.service[0]!, serviceEndpoint: author.pds }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  const records = Array.from({ length: n }, (_u, i) => ({
    uri: `at://${AUTHORS[0]!.did}/exchange.recipe.recipe/r${i}`,
    // A valid-format CIDv1 so integrity parsing succeeds; content won't hash to
    // it, so cards render as unverified — fine, they still count as recipe-items.
    cid: 'bafyreibrowsemixed0001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    value: {
      $type: 'exchange.recipe.recipe',
      name: `Paginated Recipe ${i}`,
      text: 'A generated recipe for the pagination test.',
      ingredients: ['x'],
      instructions: ['y'],
      createdAt: '2026-07-10T00:00:00Z',
      updatedAt: '2026-07-10T00:00:00Z',
    },
  }));
  for (const author of AUTHORS) {
    await page.route(`${author.pds}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ records: author.records ? records : [] }),
      });
    });
  }
};

// Full-text search (recipe-text-search plan). The mixed fixture: Greek Salad
// (ingredients incl. feta + tomato), American Pancakes, Italian Minestrone
// (ingredients incl. tomato), Greek Vegan Lunch Bowl (ingredients incl. lemon).
test('search: an ingredient-only term (feta) surfaces the recipe; status is honest', async ({
  page,
}) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await page.getByTestId('recipe-search').fill('feta');
  // "feta" appears only in Greek Salad's ingredients, not its title.
  await expect(page.getByTestId('recipe-item')).toHaveCount(1);
  await expect(page.getByText('Greek Salad')).toBeVisible();
  await expect(page.getByTestId('recipes-status')).toContainText('1 of 4 recipes');
});

test('search: a term in two recipes’ ingredients (tomato) returns both', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await page.getByTestId('recipe-search').fill('tomato');
  // Ingredient reach: Greek Salad + Italian Minestrone both list tomato.
  await expect(page.getByTestId('recipe-item')).toHaveCount(2);
  await expect(page.getByText('Greek Salad')).toBeVisible();
  await expect(page.getByText('Italian Minestrone')).toBeVisible();
  await expect(page.getByTestId('recipes-status')).toContainText('2 of 4 recipes');
});

test('search: a one-edit typo (pancaks) still finds Pancakes (fuzzy)', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await page.getByTestId('recipe-search').fill('pancaks');
  await expect(page.getByTestId('recipe-item')).toHaveCount(1);
  await expect(page.getByText('American Pancakes')).toBeVisible();
});

test('search: reset clears the query — back to 4 and the plain count', async ({
  page,
}) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await page.getByTestId('recipe-search').fill('feta');
  await expect(page.getByTestId('recipe-item')).toHaveCount(1);
  // A query is a filter: reset shows in the count block with NO popover opened.
  await expect(page.getByTestId('filters-dd')).toHaveJSProperty('open', false);
  await expect(page.getByTestId('reset-filters')).toBeVisible();

  await page.getByTestId('reset-filters').click();
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await expect(page.getByTestId('recipe-search')).toHaveValue('');
  await expect(page.getByTestId('recipes-status')).toHaveText('4 recipes');
});

test('search composes with a facet: cuisine greek + query lemon → only the Lunch Bowl', async ({
  page,
}) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await openFilters(page);
  await page.locator('input[data-dimension=cuisine][data-value=greek]').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(2); // Greek Salad + Lunch Bowl
  await page.getByTestId('recipe-search').fill('lemon');
  // Of the two Greek recipes, only the Lunch Bowl lists lemon.
  await expect(page.getByTestId('recipe-item')).toHaveCount(1);
  await expect(page.getByText('Greek Vegan Lunch Bowl')).toBeVisible();
  await expect(page.getByTestId('recipes-status')).toContainText('1 of 4 recipes');
});

// D7 mobile: Browse shows at most TWO control rows before content (the source
// row is Cookbook-only and collapses here), and no horizontal overflow @390px.
test('mobile (390px): Browse shows at most two toolbar rows before content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.browse-toolbar .toolbar-row:visible')).toHaveCount(2);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'no horizontal overflow @390px').toBeLessThanOrEqual(1);
});

// D7: the single Filters ▾ badge counts active browse filters (photos + facets);
// reset clears them and hides the badge. The honest count stays outside.
test('Filters ▾ badge counts active filters; reset clears it', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await expect(page.getByTestId('filters-count')).toBeHidden();

  await openFilters(page);
  await page.getByTestId('photos-only').check();
  await page.locator('input[data-dimension=category][data-value=dinner]').check();
  // photos (1) + one Meal facet (1) = 2 active filters.
  await expect(page.getByTestId('filters-count')).toHaveText('2');
  // The honest count lives OUTSIDE the disclosure.
  await expect(page.getByTestId('recipes-status')).toContainText('of 4 recipes');

  // Reset lives in the count block, not the popover: close the popover, then a
  // single visible tap clears the facets and the badge.
  await page.getByTestId('filters-dd').locator('summary').click(); // close
  await expect(page.getByTestId('filters-dd')).toHaveJSProperty('open', false);
  await expect(page.getByTestId('reset-filters')).toBeVisible();
  await page.getByTestId('reset-filters').click();
  await expect(page.getByTestId('filters-count')).toBeHidden();
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
});

test('browse paginates the feed at 50 with prev/next arrows', async ({ page }) => {
  await routeManyRecipes(page, 55);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  // First page: 50 of 55, with a pager.
  await expect(page.getByTestId('recipe-item')).toHaveCount(50);
  await expect(page.getByTestId('browse-pager')).toContainText(/Showing 1[–-]50 of 55/);
  // Next → the final 5.
  await page.getByTestId('browse-next').click();
  await expect(page.getByTestId('recipe-item')).toHaveCount(5);
  await expect(page.getByTestId('browse-pager')).toContainText(/Showing 51[–-]55 of 55/);
  // Prev → back to the first 50.
  await page.getByTestId('browse-prev').click();
  await expect(page.getByTestId('recipe-item')).toHaveCount(50);
});

// Export-count bug: the toolbar counts recipes (records), but the export used to
// count — and serialize — only the version-collapsed card representatives, so a
// feed with alternative versions read "N recipes" up top and "Export M shown
// recipes" (M < N) in the panel, silently dropping the alternates from the file.
test('export counts and serializes every shown recipe, not just collapsed cards', async ({
  page,
}) => {
  await routeVersionsFeed(page);
  await page.goto('/');
  // The two banana-bread versions collapse to ONE card…
  await expect(page.getByTestId('recipe-item')).toHaveCount(1, { timeout: 15_000 });
  // …while the toolbar counts both records.
  await expect(page.getByTestId('recipes-status')).toHaveText('2 recipes');

  // The export panel must advertise the SAME count the toolbar shows.
  await page.getByTestId('export-recipes').click();
  await expect(page.locator('.export-title')).toHaveText('Export 2 shown recipes');

  // And the file itself carries both versions — nothing silently dropped.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-download').click();
  const download = await downloadPromise;
  const csv = readFileSync(await download.path(), 'utf8');
  expect(csv).toContain('My Favorite Banana Bread');
  expect(csv).toContain('Classic Moist Banana Bread');
});

// The app-wide taste preference (Settings) redefines the eligible pool: the
// status counts that pool as the plain total (not "X of N", which would read
// as eligible recipes withheld), and on-tab filters count against it.
test('taste preference: the count IS the eligible pool; on-tab filters count against it', async ({
  page,
}) => {
  await routeMixedFeed(page);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'taste-preference',
      JSON.stringify({ only: { cuisine: [], category: [] }, never: { cuisine: ['greek'], category: [] } }),
    );
  });
  await page.goto('/');
  // Both Greek recipes drop out of the pool: the plain count is 2, not "2 of 4".
  await expect(page.getByTestId('recipe-item')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByTestId('recipes-status')).toHaveText('2 recipes');

  // The facet dropdowns offer only the eligible pool: no "greek" option that
  // could only ever yield zero results.
  await openFilters(page);
  await expect(page.locator('input[data-dimension=cuisine][data-value=greek]')).toHaveCount(0);
  await expect(page.locator('input[data-dimension=cuisine][data-value=italian]')).toHaveCount(1);
  await page.getByTestId('filters-dd').locator('summary').click(); // close

  // The export panel counts the same shown set.
  await page.getByTestId('export-recipes').click();
  await expect(page.locator('.export-title')).toHaveText('Export 2 shown recipes');

  // An on-tab filter narrows WITHIN the pool: "X of 2", never "of 4".
  await page.getByTestId('export-close').click();
  await page.getByTestId('recipe-search').fill('tomato');
  // Of the eligible pair, only Italian Minestrone lists tomato (Greek Salad is
  // out of the pool).
  await expect(page.getByTestId('recipe-item')).toHaveCount(1);
  await expect(page.getByTestId('recipes-status')).toHaveText('1 of 2 recipes');
});
