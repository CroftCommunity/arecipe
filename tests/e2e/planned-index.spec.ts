// RUN-LAST-PLANNED wiring (hermetic): the DERIVED planning history surfaces on
// the reader pages, from the local planned-index cache alone — no plan-record
// fetch, no auth. Covers:
//  - recipe page shows [data-testid="last-planned"] from a seeded cache (18)
//  - with no cache, that element is absent and nothing errors (19)
//  - Cookbook offers the two planned sorts; "Longest since planned" orders the
//    planned recipes and quarantines never-planned into the tail group (20)
//  - Browse reads the cache but writes NO PDS record — zero-auth intact (22)
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');
const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');

// --- Planned-index cache seed (IndexedDB: db 'arecipe-planned-index', store
// 'index', keyPath 'key'). Mirrors createPlannedIndexCache's stored shape. ---
type SeedEntry = { uri: string; count: number; daysAgo: number | null };
const seedPlannedIndex = async (page: Page, entries: SeedEntry[]): Promise<void> => {
  await page.addInitScript((seed: SeedEntry[]) => {
    const iso = (daysAgo: number): string =>
      new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
    const index = seed.map((e) => [
      e.uri,
      { count: e.count, lastPlanned: e.daysAgo === null ? null : iso(e.daysAgo), nextPlanned: null },
    ]);
    const req = indexedDB.open('arecipe-planned-index', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('index', { keyPath: 'key' });
    req.onsuccess = () => {
      const db = req.result;
      db.transaction('index', 'readwrite')
        .objectStore('index')
        .put({ key: 'planned-index', index, fingerprint: [] });
    };
  }, entries);
};

// ---------------------------------------------------------------------------
// Recipe page reader (D5)
// ---------------------------------------------------------------------------
const RECIPE_AUTHOR_DID = 'did:plc:26tsx5juuss4yealylyfbj4h';
const RECIPE_AUTHOR_PDS = 'https://morel.us-east.host.bsky.network';
const RECIPE_URI = `at://${RECIPE_AUTHOR_DID}/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D`;

const routeRecipe = async (page: Page): Promise<void> => {
  await page.route('https://plc.directory/**', async (route) => {
    const doc = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
      id: string;
      service: { serviceEndpoint: string }[];
    };
    doc.id = RECIPE_AUTHOR_DID;
    doc.service[0]!.serviceEndpoint = RECIPE_AUTHOR_PDS;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  await page.route(`${RECIPE_AUTHOR_PDS}/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('getRecord')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: atprotoFixture('getRecord-exchange.recipe.recipe.json'),
      });
    }
    // Comments / interactions / anything else → empty.
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
  });
};

test('recipe page shows the viewer’s planned history from a seeded cache (18)', async ({ page }) => {
  await routeRecipe(page);
  await seedPlannedIndex(page, [{ uri: RECIPE_URI, count: 3, daysAgo: 3 }]);
  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}`);
  await expect(page.locator('h2')).toContainText('White Chocolate', { timeout: 15_000 });
  const line = page.getByTestId('last-planned');
  await expect(line).toBeVisible();
  await expect(line).toHaveText('last planned 3 days ago · planned 3 times');
});

test('recipe page: with no cache, the last-planned line is absent and nothing errors (19)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await routeRecipe(page);
  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}`);
  await expect(page.locator('h2')).toContainText('White Chocolate', { timeout: 15_000 });
  // Give the async cache read a beat to (not) render anything.
  await expect(page.getByTestId('like-button')).toBeVisible();
  await expect(page.getByTestId('last-planned')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Cookbook sort (D6) — shared cookbook view (no auth), fixture-routed
// ---------------------------------------------------------------------------
const VIEWED = { did: 'did:plc:viewed0000000000000000aa', pds: 'https://viewed.test' };
const RECIPE = (rkey: string): string => `at://${VIEWED.did}/exchange.recipe.recipe/${rkey}`;
const GREEK = RECIPE('browsemixed0001'); // Greek Salad — will be "planned"
// American Pancakes (browsemixed0002) is left out of the cache → never-planned.

const routeCookbook = async (page: Page): Promise<void> => {
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    alsoKnownAs?: string[];
    service: { serviceEndpoint: string }[];
  };
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    if (did !== VIEWED.did) return route.fulfill({ status: 404, body: '{}' });
    const doc = { ...template, id: did, alsoKnownAs: ['at://viewed.example.com'], service: [{ ...template.service[0]!, serviceEndpoint: VIEWED.pds }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  await page.route('https://public.api.bsky.app/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ followers: [] }) });
  });
  const mixed = JSON.parse(atprotoFixture('listRecords-browse-mixed.json')) as {
    records: { uri: string; cid: string; value: Record<string, unknown> }[];
  };
  const rekeyed = (i: number): { uri: string; cid: string; value: Record<string, unknown> } => {
    const r = mixed.records[i]!;
    return { ...r, uri: r.uri.replace(/did:plc:[a-z0-9]+/, VIEWED.did) };
  };
  const viewedOwn = [rekeyed(0), rekeyed(1)]; // Greek Salad + American Pancakes
  await page.route(`${VIEWED.pds}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('listRecords') && url.searchParams.get('collection') === 'exchange.recipe.recipe') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: viewedOwn }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
  });
};

test('Cookbook offers the two planned sorts; Longest since planned quarantines never-planned (20)', async ({
  page,
}) => {
  await routeCookbook(page);
  await seedPlannedIndex(page, [{ uri: GREEK, count: 4, daysAgo: 30 }]);
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });

  // The two planned-history sorts are offered (cache present).
  await page.getByTestId('sort-dd').locator('summary').click();
  await expect(page.getByText('Longest since planned')).toBeVisible();
  await expect(page.getByText('Recently planned')).toBeVisible();

  // Choose "Longest since planned" → the planned recipe leads; the never-planned
  // one is quarantined below the divider, not interleaved.
  await page.locator('input[data-sort="planned-longest"]').click();
  const group = page.getByTestId('never-planned-group');
  await expect(group).toBeVisible();
  await expect(group).toContainText('American Pancakes');
  // Greek Salad (planned) is on the page but NOT inside the never-planned group.
  await expect(page.getByText('Greek Salad')).toBeVisible();
  await expect(group.getByText('Greek Salad')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Browse zero-auth intact (22) — reads the cache, writes no PDS record
// ---------------------------------------------------------------------------
test('Browse reads the planned-index cache but writes NO PDS record (22)', async ({ page }) => {
  let createRecordCalls = 0;
  await page.route('**/xrpc/com.atproto.repo.createRecord', async (route) => {
    createRecordCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await seedPlannedIndex(page, [{ uri: 'at://did:plc:x/exchange.recipe.recipe/seed', count: 1, daysAgo: 5 }]);
  await page.goto('/');
  await expect(page.getByTestId('recipe-search')).toBeVisible({ timeout: 15_000 });
  // The planned sorts appear because a cache exists (D6) — proof the reader ran.
  await page.getByTestId('sort-dd').locator('summary').click();
  await expect(page.getByText('Longest since planned')).toBeVisible();
  // Reader only: Browse ships zero auth code — never a PDS write.
  expect(createRecordCalls).toBe(0);
});
