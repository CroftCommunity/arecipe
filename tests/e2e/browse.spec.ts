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

test('photos-only hides the image-less recipe and updates the count (wiring)', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  // Unfiltered: all four recipes, original starter-pack status string.
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await expect(page.getByTestId('recipes-status')).toContainText('starter pack recipes');
  await expect(page.getByTestId('recipes-status')).not.toContainText('of 4 shown');

  // Photos only ON: the one image-less recipe (Minestrone) drops out.
  await page.getByTestId('photos-only').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
  await expect(page.getByTestId('recipes-status')).toContainText('3 of 4 shown');

  // Photos only OFF: back to all four and the original string.
  await page.getByTestId('photos-only').uncheck();
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await expect(page.getByTestId('recipes-status')).toContainText('starter pack recipes');
});

test('reset filters clears active browse filters; status drops the verified count (wiring)', async ({
  page,
}) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  // No browse filter → no visible reset control.
  await expect(page.getByTestId('reset-filters')).toBeHidden();

  // Apply a filter: the reset control appears; the status reads "N of M shown"
  // with NO verified count (per the trust-surface simplification).
  await page.getByTestId('photos-only').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
  const status = page.getByTestId('recipes-status');
  await expect(status).toContainText('3 of 4 shown');
  await expect(status).not.toContainText('verified');
  await expect(page.getByTestId('reset-filters')).toBeVisible();

  // Reset: full list back, photos-only unchecked, control hidden again.
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
  await page.getByTestId('photos-only').check();
  await expect(page.locator('.recipe-rows')).toBeVisible();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3); // image-less row dropped
});

test('photos-only choice persists across reload', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('photos-only').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);

  await page.reload();
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('photos-only')).toBeChecked();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
});

// Facet filtering. Mixed fixture: Greek Salad (greek/dinner), American Pancakes
// (american/breakfast), Italian Minestrone (italian/dinner), Greek Vegan Lunch
// Bowl (greek/lunch).
const openFacet = async (page: Page, dimension: 'category' | 'cuisine'): Promise<void> => {
  await page.locator(`details.facet-dd[data-dimension=${dimension}] summary`).click();
};

test('Meal facet narrows to matching recipes and updates the count (wiring)', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await openFacet(page, 'category');
  await page.locator('input[data-dimension=category][data-value=dinner]').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(2); // Greek Salad + Minestrone
  await expect(page.getByTestId('recipes-status')).toContainText('2 of 4 shown');
});

test('OR within a dimension; multi-select keeps the dropdown open', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await openFacet(page, 'category');
  await page.locator('input[data-dimension=category][data-value=dinner]').check();
  // The panel must stay open so a second selection is cumulative.
  await page.locator('input[data-dimension=category][data-value=breakfast]').check();
  await expect(page.locator('details.facet-dd[data-dimension=category][open]')).toHaveCount(1);
  await expect(page.getByTestId('recipe-item')).toHaveCount(3); // 2 dinner + 1 breakfast
});

test('AND across dimensions: cuisine greek + meal lunch → one recipe', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await openFacet(page, 'cuisine');
  await page.locator('input[data-dimension=cuisine][data-value=greek]').check();
  await openFacet(page, 'category');
  await page.locator('input[data-dimension=category][data-value=lunch]').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(1); // Greek Vegan Lunch Bowl
  await expect(page.getByTestId('recipes-status')).toContainText('1 of 4 shown');
});

test('facet selections persist across reload', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await openFacet(page, 'category');
  await page.locator('input[data-dimension=category][data-value=dinner]').check();
  await expect(page.getByTestId('recipe-item')).toHaveCount(2);

  await page.reload();
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(2);
  await openFacet(page, 'category');
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

test('cook typeahead: typing suggests cooks; picking one loads their recipes (wiring)', async ({
  page,
}) => {
  await disableStarters(page);
  await routeCookTypeahead(page);
  await page.goto('/');
  // Lands on the empty search box (starter pack off).
  await expect(page.getByTestId('handle-input')).toBeVisible();

  // Type a partial handle → the AppView suggestion appears.
  await page.getByTestId('handle-input').fill('ch');
  const options = page.locator('[role=option]');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('cheftest.bsky.social');

  // Pick it → the handle fills and the existing find path loads that cook's recipes.
  await options.first().click();
  await expect(page.getByTestId('handle-input')).toHaveValue('cheftest.bsky.social');
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
  await page.getByTestId('handle-input').fill('c'); // one char — below minChars (2)
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
