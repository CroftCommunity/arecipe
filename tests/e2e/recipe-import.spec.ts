// Recipe import lives on the Acquire hub (import.html), reached from Alchemy's
// Import button and registered as the Web Share Target. A share arrives as
// ?title=&text=&url= (GET). Shared TEXT imports via the ladder with no network
// (CORS sidestepped); a bare LINK is attempted and falls back to a paste box when
// the site blocks cross-origin reads. Recipe URLs are cross-origin, so we
// intercept them with page.route. Nothing published — every path lands a LOCAL
// draft in the editor.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/import/${name}`, import.meta.url), 'utf8');

const RECIPE_URL = 'https://recipes.test/pancakes';

/** Route the recipe URL to serve fixture HTML with a permissive CORS header,
 *  so the in-page `fetch(url, { mode: 'cors' })` succeeds. */
const routeServe = async (page: Page, body: string): Promise<void> => {
  await page.route('https://recipes.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'access-control-allow-origin': '*' },
      body,
    }),
  );
};

/** Route the recipe URL to fail the fetch (no CORS header / network error). */
const routeFail = async (page: Page): Promise<void> => {
  await page.route('https://recipes.test/**', (route) => route.abort('failed'));
};

/** Open the Acquire hub as if opened from a share (Web Share Target GET params). */
const share = async (page: Page, params: Record<string, string>): Promise<void> => {
  await page.goto(`/import.html?${new URLSearchParams(params).toString()}`);
};

const CORNBREAD = [
  'Grandma’s Cornbread',
  '',
  '1 cup cornmeal',
  '1 cup flour',
  '1 tablespoon sugar',
  '',
  '1. Mix the dry ingredients.',
  '2. Bake at 400°F.',
].join('\n');

test('Alchemy links to the Acquire hub; no import panel is mounted inline', async ({ page }) => {
  await page.goto('/mine.html');
  await page.getByTestId('new-recipe').waitFor({ timeout: 15_000 });
  const importLink = page.getByTestId('import-recipe');
  await expect(importLink).toBeVisible();
  await expect(importLink).toHaveAttribute('href', /import\.html$/);
  await expect(page.getByTestId('import-panel')).toHaveCount(0); // hub is a separate page
});

test('the Acquire hub offers the 0→1 paths (paste, from a link, scan a photo, build from scratch)', async ({
  page,
}) => {
  await page.goto('/import.html');
  await expect(page.getByTestId('acquire-hub')).toBeVisible();
  await expect(page.getByTestId('import-paste')).toBeVisible(); // paste, pre-revealed
  await expect(page.getByTestId('import-url')).toBeVisible(); // from a link
  await expect(page.getByTestId('acquire-photo')).toBeVisible(); // scan a photo
  await expect(page.getByTestId('acquire-scratch')).toHaveAttribute('href', /editor\.html$/);
});

test('shared recipe TEXT auto-imports with no fetch (CORS sidestepped)', async ({ page }) => {
  await share(page, { title: 'Grandma’s Cornbread', text: CORNBREAD, url: RECIPE_URL });
  await expect(page).toHaveURL(/editor\.html\?draft=/, { timeout: 15_000 });
  await expect(page.getByTestId('editor-ingredients')).toHaveValue(/cornmeal/);
  await expect(page.getByTestId('editor-instructions')).toHaveValue(/Mix the dry ingredients/);
  await expect(page.getByTestId('editor-provenance')).toContainText('recipes.test');
  await expect(page.getByTestId('editor-etiquette')).toBeVisible();
  await expect(page.getByTestId('publish')).toBeVisible(); // separate, deliberate act
});

test('a shared CORS-friendly link imports via JSON-LD', async ({ page }) => {
  await routeServe(page, fixture('plain-recipe.html'));
  await share(page, { title: 'Pancakes', url: RECIPE_URL });
  await expect(page).toHaveURL(/editor\.html\?draft=/, { timeout: 15_000 });
  await expect(page.getByTestId('editor-name')).toHaveValue('Classic Pancakes');
  await expect(page.getByTestId('editor-provenance')).toContainText('recipes.test');
});

test('a shared bare link that blocks CORS falls back to paste; pasted source imports', async ({
  page,
}) => {
  await routeFail(page);
  await share(page, { title: 'A Recipe', url: RECIPE_URL });
  // Panel mounted itself, attempted the fetch, and revealed paste with honest copy.
  await expect(page.getByTestId('import-paste-block')).toBeVisible();
  await expect(page.getByTestId('import-status')).toContainText(/can’t be read directly/);
  // The share query is stripped so a reload doesn't re-trigger.
  await expect(page).toHaveURL(/\/import\.html$/);

  await page.getByTestId('import-paste').fill(fixture('graph-recipe.html'));
  await page.getByTestId('import-paste-run').click();
  await expect(page).toHaveURL(/editor\.html\?draft=/, { timeout: 15_000 });
  await expect(page.getByTestId('editor-name')).toHaveValue('Tomato Soup');
  await expect(page.getByTestId('editor-provenance')).toContainText('recipes.test');
});

test('shared text with no recipe shows the honest error and does not navigate', async ({ page }) => {
  await share(page, { text: 'Just a story about my vacation by the sea, nothing to cook.' });
  await expect(page.getByTestId('import-status')).toContainText(/Couldn’t find a recipe/);
  await expect(page).toHaveURL(/import\.html/);
});

test('a partial shared import flags the missing side and leaves it blank (no fabrication)', async ({
  page,
}) => {
  await share(page, {
    text: ['Quick Snack', '', '1 apple', '2 tablespoons peanut butter', '1 teaspoon honey'].join('\n'),
  });
  await expect(page).toHaveURL(/editor\.html\?draft=/, { timeout: 15_000 });
  await expect(page.getByTestId('editor-ingredients')).toHaveValue(/apple/);
  await expect(page.getByTestId('editor-instructions')).toHaveValue('');
});

test('the import panel and paste area fit a phone width (≤390px)', async ({ page }) => {
  await routeFail(page);
  await page.setViewportSize({ width: 390, height: 780 });
  await share(page, { title: 'A Recipe', url: RECIPE_URL });
  await expect(page.getByTestId('import-paste')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'import panel overflows at 390px').toBeLessThanOrEqual(1);
});
