// Account page — hermetic (no auth). The Taste section is device-local, so it
// renders and persists without a session. It holds two buckets: "Only show me"
// (the app-wide dietary preference, moved here from Settings — written here,
// read by Browse) above "Never show me" (exclusions by meal + cuisine), a
// titled block with two Browse-style dropdowns (Meals ▾ / Cuisines ▾), each
// carrying a count bubble. This guards the account taste UI: both buckets
// mount, choices persist across reloads, and Browse honors the diet whitelist
// cross-page (fed the mixed fixture — Greek Salad, American Pancakes [no diet],
// Italian Minestrone, Greek Vegan Lunch Bowl — so only Pancakes is
// non-vegetarian).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');
const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

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

test('diet preference persists and filters Browse to matching recipes (wiring)', async ({
  page,
}) => {
  await routeMixedFeed(page);
  await page.goto('/account.html');

  // The "Only show me" bucket sits in the Taste section, above "Never show me",
  // with the anchor the Browse link targets.
  const section = page.locator('#diet-preference');
  await expect(section).toBeVisible({ timeout: 15_000 });
  const taste = page.getByTestId('taste-prefs');
  await expect(taste).toContainText('Only show me');
  await expect(taste.locator('.taste-only-block + .taste-never-block')).toBeVisible();
  const veg = section.locator('input[data-token=dietVegetarian]');
  await veg.check();

  // Persists across reload.
  await page.reload();
  await expect(page.locator('#diet-preference input[data-token=dietVegetarian]')).toBeChecked();

  // Cross-page: Browse now hides the one non-vegetarian recipe (Pancakes). A
  // standing preference redefines the eligible pool, so the count is the plain
  // "3 recipes" — not "3 of 4", which would read as eligible recipes withheld.
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
  await expect(page.getByTestId('recipes-status')).toHaveText('3 recipes');
});

test('clearing the diet preference restores all recipes on Browse', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/account.html');
  const veg = page.locator('#diet-preference input[data-token=dietVegetarian]');
  await veg.check();
  await veg.uncheck();
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await expect(page.getByTestId('recipes-status')).toHaveText('4 recipes');
});

test('account taste "Never show me" excludes via per-dimension dropdowns with persistent counts', async ({
  page,
}) => {
  await page.goto('/account.html');

  const section = page.getByTestId('taste-prefs');
  await expect(section).toBeVisible({ timeout: 15_000 });
  await expect(section).toContainText('Never show me');

  // Two separate dropdowns — Meals ▾ and Cuisines ▾ (the Browse facet idiom).
  await expect(page.getByTestId('taste-never-category')).toBeVisible();
  const cuisines = page.getByTestId('taste-never-cuisine');
  await expect(cuisines).toBeVisible();

  const openCuisines = async (): Promise<void> => {
    await cuisines.locator('summary').click();
    await expect(page.getByTestId('taste-never-cuisine-thai')).toBeVisible();
  };
  const cuisineCount = page.getByTestId('taste-never-cuisine-count');

  // No exclusions yet → no count bubble.
  await expect(cuisineCount).toBeHidden();

  // Exclude a cuisine — the count bubble appears and persists across a reload,
  // visible without opening the dropdown.
  await openCuisines();
  await page.getByTestId('taste-never-cuisine-thai').check();
  await expect(cuisineCount).toHaveText('1');

  await page.reload();
  await expect(cuisineCount).toHaveText('1');
  await openCuisines();
  await expect(page.getByTestId('taste-never-cuisine-thai')).toBeChecked();

  // Unchecking clears it (and the bubble), persisted across a reload.
  await page.getByTestId('taste-never-cuisine-thai').uncheck();
  await page.reload();
  await expect(cuisineCount).toBeHidden();
  await openCuisines();
  await expect(page.getByTestId('taste-never-cuisine-thai')).not.toBeChecked();
});

test('calendar-publish section renders for everyone; enabling reveals config and persists', async ({
  page,
}) => {
  await page.goto('/account.html');
  const section = page.getByTestId('calendar-publish');
  await expect(section).toBeVisible({ timeout: 15_000 });
  await section.locator('summary').click(); // expand the <details>

  // The intro copy links "setup guide" before the feature is even enabled.
  const introGuide = page.getByTestId('calendar-guide-link-intro');
  await expect(introGuide).toBeVisible();
  await expect(introGuide).toHaveAttribute('href', './calendar-setup.html');

  // Config body stays hidden until the feature is enabled on this device.
  await expect(page.getByTestId('calendar-config')).toBeHidden();
  await page.getByTestId('calendar-enabled').check();
  await expect(page.getByTestId('calendar-config')).toBeVisible();
  await expect(page.getByTestId('calendar-repo')).toBeVisible();
  await expect(page.getByTestId('calendar-guide-link')).toBeVisible();

  // The enable toggle is device-local and survives a reload.
  await page.reload();
  await page.getByTestId('calendar-publish').locator('summary').click();
  await expect(page.getByTestId('calendar-enabled')).toBeChecked();
});
