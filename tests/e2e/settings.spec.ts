// Settings "Only show me" dietary preference (Phase 8). The preference is
// app-wide: Settings writes it, Browse reads it. This suite proves both the
// persistence and the cross-page wiring (a vegetarian preference set here
// hides non-vegetarian recipes on Browse). Browse is fed the mixed fixture
// (Greek Salad, American Pancakes [no diet], Italian Minestrone, Greek Vegan
// Lunch Bowl) so only Pancakes is non-vegetarian.
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
  await page.goto('/settings.html');

  // The "Only show me" section exists with the anchor the Browse link targets.
  const section = page.locator('#diet-preference');
  await expect(section).toBeVisible();
  const veg = section.locator('input[data-token=dietVegetarian]');
  await veg.check();

  // Persists across reload.
  await page.reload();
  await expect(page.locator('#diet-preference input[data-token=dietVegetarian]')).toBeChecked();

  // Cross-page: Browse now hides the one non-vegetarian recipe (Pancakes).
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
  await expect(page.getByTestId('recipes-status')).toContainText('3 of 4 shown');
});

test('clearing the diet preference restores all recipes on Browse', async ({ page }) => {
  await routeMixedFeed(page);
  await page.goto('/settings.html');
  const veg = page.locator('#diet-preference input[data-token=dietVegetarian]');
  await veg.check();
  await veg.uncheck();
  await page.goto('/');
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await expect(page.getByTestId('recipes-status')).toContainText('starter pack recipes');
});

test('settings: Hidden recipes is collapsed by default with a count, expandable', async ({
  page,
}) => {
  await page.goto('/settings.html');
  const section = page.getByTestId('hidden-recipes');
  await expect(section).toBeVisible();
  // Collapsed by default: the summary carries a count; rows are hidden until opened.
  const summary = section.locator('summary').first();
  await expect(summary).toContainText(/Hidden recipes \(\d+\)/);
  const firstRow = section.getByTestId('hidden-row').first();
  await expect(firstRow).toBeHidden();
  // Expand → the rows appear.
  await summary.click();
  await expect(firstRow).toBeVisible();
});
