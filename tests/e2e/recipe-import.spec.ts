// Phase 5 (recipe-import): hermetic end-to-end of "import a recipe from a link"
// on Alchemy. Recipe URLs are cross-origin, so we intercept them with
// page.route: a routed page that returns JSON-LD WITH an Access-Control-Allow-
// Origin header exercises the direct-fetch success path; an aborted route
// simulates the CORS/network failure that expands the paste fallback. No network
// touched, nothing published — every path lands a LOCAL draft in the editor.
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

const openPanel = async (page: Page): Promise<void> => {
  await page.goto('/mine.html');
  await page.getByTestId('new-recipe').waitFor({ timeout: 15_000 });
  await page.getByTestId('import-open').click();
  await expect(page.getByTestId('import-body')).toBeVisible();
};

test('URL import: a JSON-LD page lands a prefilled draft in the editor (nothing published)', async ({
  page,
}) => {
  await routeServe(page, fixture('plain-recipe.html'));
  await openPanel(page);
  await page.getByTestId('import-url').fill(RECIPE_URL);
  await page.getByTestId('import-run').click();

  // Lands in the editor on a fresh local draft, prefilled from the page.
  await expect(page).toHaveURL(/editor\.html\?draft=/, { timeout: 15_000 });
  await expect(page.getByTestId('editor-name')).toHaveValue('Classic Pancakes');
  await expect(page.getByTestId('editor-ingredients')).toHaveValue(/cups flour/);
  await expect(page.getByTestId('editor-instructions')).toHaveValue(/Whisk the dry ingredients/);
  // Provenance + the single etiquette nudge show for an imported draft.
  await expect(page.getByTestId('editor-provenance')).toContainText('recipes.test');
  await expect(page.getByTestId('editor-etiquette')).toBeVisible();
  // Publish is a separate, deliberate act — the draft is not published.
  await expect(page.getByTestId('publish')).toBeVisible();
});

test('CORS failure expands the paste flow; pasted page source imports identically', async ({
  page,
}) => {
  await routeFail(page);
  await openPanel(page);
  await page.getByTestId('import-url').fill(RECIPE_URL);
  await expect(page.getByTestId('import-paste-block')).toBeHidden();
  await page.getByTestId('import-run').click();

  // Honest copy, and the paste area appears.
  await expect(page.getByTestId('import-paste-block')).toBeVisible();
  await expect(page.getByTestId('import-status')).toContainText(/doesn’t allow direct reading/);

  await page.getByTestId('import-paste').fill(fixture('graph-recipe.html'));
  await page.getByTestId('import-paste-run').click();
  await expect(page).toHaveURL(/editor\.html\?draft=/, { timeout: 15_000 });
  await expect(page.getByTestId('editor-name')).toHaveValue('Tomato Soup');
  await expect(page.getByTestId('editor-provenance')).toContainText('recipes.test');
});

test('pasting plain recipe text imports via the heuristic', async ({ page }) => {
  await routeFail(page);
  await openPanel(page);
  await page.getByTestId('import-url').fill(RECIPE_URL);
  await page.getByTestId('import-run').click();
  await expect(page.getByTestId('import-paste-block')).toBeVisible();

  await page.getByTestId('import-paste').fill(
    [
      'Grandma’s Cornbread',
      '',
      '1 cup cornmeal',
      '1 cup flour',
      '1 tablespoon sugar',
      '',
      '1. Mix the dry ingredients.',
      '2. Bake at 400°F.',
    ].join('\n'),
  );
  await page.getByTestId('import-paste-run').click();
  await expect(page).toHaveURL(/editor\.html\?draft=/, { timeout: 15_000 });
  await expect(page.getByTestId('editor-ingredients')).toHaveValue(/cornmeal/);
  await expect(page.getByTestId('editor-instructions')).toHaveValue(/Mix the dry ingredients/);
});

test('a no-recipe paste shows the honest error and does not navigate', async ({ page }) => {
  await routeFail(page);
  await openPanel(page);
  await page.getByTestId('import-url').fill(RECIPE_URL);
  await page.getByTestId('import-run').click();
  await expect(page.getByTestId('import-paste-block')).toBeVisible();

  await page.getByTestId('import-paste').fill('Just a story about my vacation by the sea, nothing to cook.');
  await page.getByTestId('import-paste-run').click();
  await expect(page.getByTestId('import-status')).toContainText(/Couldn’t find a recipe/);
  await expect(page).toHaveURL(/mine\.html/);
});

test('a partial import flags the missing side and leaves it blank (no fabrication)', async ({
  page,
}) => {
  await routeFail(page);
  await openPanel(page);
  await page.getByTestId('import-url').fill(RECIPE_URL);
  await page.getByTestId('import-run').click();
  await expect(page.getByTestId('import-paste-block')).toBeVisible();

  await page.getByTestId('import-paste').fill(
    ['Quick Snack', '', '1 apple', '2 tablespoons peanut butter', '1 teaspoon honey'].join('\n'),
  );
  await page.getByTestId('import-paste-run').click();
  await expect(page).toHaveURL(/editor\.html\?draft=/, { timeout: 15_000 });
  await expect(page.getByTestId('editor-ingredients')).toHaveValue(/apple/);
  // The missing side is left blank — never fabricated.
  await expect(page.getByTestId('editor-instructions')).toHaveValue('');
});

test('Web Share Target: shared recipe text auto-imports with no fetch (CORS sidestepped)', async ({
  page,
}) => {
  // A share arrives as ?title=&text=&url= (GET target). Shared TEXT goes straight
  // through the heuristic — no network — so route nothing.
  const text = [
    'Grandma’s Cornbread',
    '',
    '1 cup cornmeal',
    '1 cup flour',
    '1 tablespoon sugar',
    '',
    '1. Mix the dry ingredients.',
    '2. Bake at 400°F.',
  ].join('\n');
  const q = new URLSearchParams({ title: 'Grandma’s Cornbread', text, url: RECIPE_URL });
  await page.goto(`/mine.html?${q.toString()}`);
  await expect(page).toHaveURL(/editor\.html\?draft=/, { timeout: 15_000 });
  await expect(page.getByTestId('editor-ingredients')).toHaveValue(/cornmeal/);
  await expect(page.getByTestId('editor-instructions')).toHaveValue(/Mix the dry ingredients/);
  await expect(page.getByTestId('editor-provenance')).toContainText('recipes.test');
});

test('Web Share Target: a bare shared link opens the panel prefilled and falls back to paste', async ({
  page,
}) => {
  await routeFail(page); // the shared link's site blocks cross-origin reads
  const q = new URLSearchParams({ title: 'A Recipe', url: RECIPE_URL });
  await page.goto(`/mine.html?${q.toString()}`);
  // Panel opened itself, prefilled the URL, attempted the fetch, and revealed paste.
  await expect(page.getByTestId('import-body')).toBeVisible();
  await expect(page.getByTestId('import-url')).toHaveValue(RECIPE_URL);
  await expect(page.getByTestId('import-paste-block')).toBeVisible();
  await expect(page.getByTestId('import-status')).toContainText(/doesn’t allow direct reading/);
  // The share query is stripped so a reload doesn't re-trigger.
  await expect(page).toHaveURL(/\/mine\.html$/);
});

test('the import panel and paste area fit a phone width (≤390px)', async ({ page }) => {
  await routeFail(page);
  await page.setViewportSize({ width: 390, height: 780 });
  await openPanel(page);
  await page.getByTestId('import-url').fill(RECIPE_URL);
  await page.getByTestId('import-run').click();
  await expect(page.getByTestId('import-paste')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'import panel overflows at 390px').toBeLessThanOrEqual(1);
});
