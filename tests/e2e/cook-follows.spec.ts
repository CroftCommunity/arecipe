// Cook follows on Browse (RUN-COOK-FOLLOWS Part A). Hermetic via routed
// fixtures. Looking up a cook PREVIEWS their recipes only (not the starter
// feed); Follow adds them to the device-local store so the default feed merges
// them in after reset; the follow is durable across reload and Browse never
// writes a PDS record (zero-auth bundle). Acceptance criteria 1–3.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');
const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

// The four starter DIDs (must match src/recipes/starter.ts); only arecipe serves
// records. The previewed cook (cook1) is NOT a starter — a distinct one-recipe
// fixture so preview vs default feed is unambiguous.
const ARECIPE_DID = 'did:plc:spfl4xaktvvchr2cqp2r2xvp';
const COOK_DID = 'did:plc:cook1';
const COOK_HANDLE = 'cheftest.bsky.social';

const PDS_BY_DID: Record<string, string> = {
  [ARECIPE_DID]: 'https://pds-arecipe.test',
  'did:plc:26tsx5juuss4yealylyfbj4h': 'https://pds-rdur.test',
  'did:plc:4cx7ts7lqgjtsfquo53qo3sz': 'https://pds-rx.test',
  'did:plc:vspq46f5zmrlesaszlyfliy2': 'https://pds-daffl.test',
  [COOK_DID]: 'https://pds-cook.test',
};

const PREVIEW_RECIPE = {
  uri: `at://${COOK_DID}/exchange.recipe.recipe/preview1`,
  cid: 'bafyreipreview00000000000000000000000000000000000000000000',
  value: {
    $type: 'exchange.recipe.recipe',
    name: 'Preview Special',
    text: 'Only this cook makes it.',
    ingredients: ['a', 'b'],
    instructions: ['mix', 'serve'],
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  },
};

let createRecordCalls = 0;

const route = async (page: Page): Promise<void> => {
  createRecordCalls = 0;
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    service: { serviceEndpoint: string }[];
  };
  // Identity: DID doc per DID (branch on the DID in the path).
  await page.route('https://plc.directory/**', async (r) => {
    const did = decodeURIComponent(r.request().url().split('/').pop() ?? '');
    const pds = PDS_BY_DID[did];
    if (pds === undefined) return r.fulfill({ status: 404, body: '{}' });
    const doc = { ...template, id: did, service: [{ ...template.service[0]!, serviceEndpoint: pds }] };
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  // AppView: resolveHandle for the previewed cook (+ empty typeahead).
  await page.route('https://public.api.bsky.app/**', async (r) => {
    const url = r.request().url();
    if (url.includes('resolveHandle')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ did: COOK_DID }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actors: [] }) });
  });
  // arecipe starter PDS → the mixed 4-recipe fixture.
  await page.route(`${PDS_BY_DID[ARECIPE_DID]}/**`, async (r) => {
    if (r.request().method() === 'POST' && r.request().url().includes('createRecord')) createRecordCalls += 1;
    await r.fulfill({ status: 200, contentType: 'application/json', body: atprotoFixture('listRecords-browse-mixed.json') });
  });
  // The other three starters → empty.
  for (const did of ['did:plc:26tsx5juuss4yealylyfbj4h', 'did:plc:4cx7ts7lqgjtsfquo53qo3sz', 'did:plc:vspq46f5zmrlesaszlyfliy2']) {
    await page.route(`${PDS_BY_DID[did]}/**`, async (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) }),
    );
  }
  // The previewed cook's PDS → one distinct recipe (list + single getRecord).
  await page.route(`${PDS_BY_DID[COOK_DID]}/**`, async (r) => {
    const url = r.request().url();
    if (r.request().method() === 'POST' && url.includes('createRecord')) createRecordCalls += 1;
    if (url.includes('getRecord')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PREVIEW_RECIPE) });
    }
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [PREVIEW_RECIPE] }) });
  });
};

// D7: the cook lookup lives in the toolbar "+ Cook" inline panel.
const lookupCook = async (page: Page): Promise<void> => {
  await page.getByTestId('add-cook').click();
  await page.getByTestId('add-cook-input').fill(COOK_HANDLE);
  await page.getByTestId('add-cook-submit').click();
};

test('looking up a cook previews their list only, with a Follow control', async ({ page }) => {
  await route(page);
  await page.goto('/');
  // Default feed first: the starter (arecipe) 4 recipes; no preview bar.
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await expect(page.getByTestId('preview-bar')).toBeHidden();

  // Look up a cook → the preview shows ONLY that cook's one recipe + a Follow bar.
  await lookupCook(page);
  await expect(page.getByTestId('preview-bar')).toBeVisible();
  await expect(page.getByTestId('preview-handle')).toContainText(COOK_HANDLE);
  await expect(page.getByTestId('follow-cook')).toHaveText('Follow');
  await expect(page.getByTestId('recipe-item')).toHaveCount(1);
  await expect(page.getByText('Preview Special')).toBeVisible();
});

test('preview survives an open-recipe round-trip', async ({ page }) => {
  await route(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await lookupCook(page);
  await expect(page.getByTestId('recipe-item')).toHaveCount(1);

  // Open the recipe, then go back — the preview (this cook's list) is restored.
  await page.getByTestId('recipe-item').first().click();
  await page.locator('h2').first().waitFor({ timeout: 15_000 });
  await page.goBack();
  await expect(page.getByTestId('preview-bar')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('preview-handle')).toContainText(COOK_HANDLE);
  await expect(page.getByTestId('recipe-item')).toHaveCount(1);
});

test('Follow → reset → the default feed merges the followed cook in', async ({ page }) => {
  await route(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await lookupCook(page);
  await expect(page.getByTestId('follow-cook')).toHaveText('Follow');

  // Follow → the control reads Following.
  await page.getByTestId('follow-cook').click();
  await expect(page.getByTestId('follow-cook')).toHaveText('Following');

  // "← Feed" returns to the default feed, now merged: 4 starter + 1 followed = 5,
  // including the cook's "Preview Special".
  await page.getByTestId('back-to-feed').click();
  await expect(page.getByTestId('preview-bar')).toBeHidden();
  await expect(page.getByTestId('recipe-item')).toHaveCount(5);
  await expect(page.getByText('Preview Special')).toBeVisible();
});

test('a published-marked follow (D1) merges into Browse and writes NO PDS record', async ({
  page,
}) => {
  // A row carrying the D1 `publishedRkey` marker (e.g. mirrored down on a
  // signed-in device, then read here signed-out) must round-trip through
  // Browse's open-world local read untouched: the cook is merged into the
  // default feed, and the zero-auth bundle still writes nothing to a PDS.
  await route(page);
  await page.addInitScript(
    ([did, handle]) => {
      localStorage.setItem(
        'cook-follows',
        JSON.stringify([{ did, handle, publishedRkey: 'r-published-elsewhere' }]),
      );
    },
    [COOK_DID, COOK_HANDLE],
  );
  await page.goto('/');
  // Default feed = 4 starter + the marked follow's 1 recipe, merged.
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(5);
  await expect(page.getByText('Preview Special')).toBeVisible();
  // The marker survived the durable store round-trip.
  const stored = await page.evaluate(() => localStorage.getItem('cook-follows'));
  expect(stored).toContain('r-published-elsewhere');
  // Browse ships zero auth code — never a PDS write.
  expect(createRecordCalls).toBe(0);
});

test('signed-out follow is durable across reload and writes NO PDS record', async ({ page }) => {
  await route(page);
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await lookupCook(page);
  await page.getByTestId('follow-cook').click();
  await expect(page.getByTestId('follow-cook')).toHaveText('Following');

  // The follow persists to the local store.
  const stored = await page.evaluate(() => localStorage.getItem('cook-follows'));
  expect(stored).toContain('did:plc:cook1');

  // Reload + re-preview → the control reflects Following from the durable store.
  await page.reload();
  await expect(page.getByTestId('recipe-search')).toBeVisible({ timeout: 15_000 });
  await lookupCook(page);
  await expect(page.getByTestId('follow-cook')).toHaveText('Following');

  // Browse ships zero auth code — it must never have created a PDS record.
  expect(createRecordCalls).toBe(0);
});
