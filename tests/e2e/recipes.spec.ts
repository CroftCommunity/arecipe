// Wiring tests: one action — a handle in, recipes out (resolve → public
// read → verified cache → cards). PDS resolution details are console
// diagnostics, not UI. Hermetic via recorded-fixture routes; the @live
// variant is the phase validation.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');
const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');

// The recorded author whose PDS the listRecords fixture came from.
const AUTHOR_DID = 'did:plc:26tsx5juuss4yealylyfbj4h';
const AUTHOR_PDS = 'https://morel.us-east.host.bsky.network';

const routeFixtures = async (page: Page): Promise<void> => {
  await page.route('https://public.api.bsky.app/**', async (route) => {
    const url = route.request().url();
    if (url.includes('resolveHandle') && url.includes('somechef')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ did: AUTHOR_DID }),
      });
    } else {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: identityFixture('resolveHandle-unresolvable.json'),
      });
    }
  });
  await page.route('https://plc.directory/**', async (route) => {
    const doc = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
      id: string;
      service: { serviceEndpoint: string }[];
    };
    doc.id = AUTHOR_DID;
    doc.service[0]!.serviceEndpoint = AUTHOR_PDS;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  await page.route(`${AUTHOR_PDS}/**`, async (route) => {
    const isSingle = route.request().url().includes('getRecord');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: atprotoFixture(
        isSingle
          ? 'getRecord-exchange.recipe.recipe.json'
          : 'listRecords-exchange.recipe.recipe.json',
      ),
    });
  });
};

test('one action: handle in, verified recipe cards out (wiring)', async ({ page }) => {
  await routeFixtures(page);
  await page.goto('/');
  await page.getByTestId('add-cook').click();
  await page.getByTestId('add-cook-input').fill('somechef.example.com');
  await page.getByTestId('add-cook-submit').click();
  await expect(page.getByTestId('recipes-status')).toHaveText('3 recipes', {
    timeout: 15_000,
  });
  // The feed renders in the daily-mix default order (position is day-seeded), so
  // assert the card is present rather than first.
  await expect(
    page.getByTestId('recipe-item').filter({ hasText: 'White Chocolate Strawberry Sourdough Sweet Bread' }),
  ).toHaveCount(1);
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
});

test('a card opens its own page; native back returns to the results (5d wiring)', async ({
  page,
}) => {
  await routeFixtures(page);
  await page.goto('/');
  await page.getByTestId('add-cook').click();
  await page.getByTestId('add-cook-input').fill('somechef.example.com');
  await page.getByTestId('add-cook-submit').click();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);

  // Click the specific card (feed order is the day-seeded daily mix, so don't
  // rely on which one is first).
  await page.getByTestId('recipe-item').filter({ hasText: 'White Chocolate Strawberry Sourdough' }).click();
  await expect(page).toHaveURL(/recipe\.html\?u=/);
  await expect(page.locator('h2')).toContainText('White Chocolate Strawberry Sourdough');
  await expect(page.getByTestId('recipe-ingredients').locator('li').first()).toBeVisible();
  await expect(page.getByTestId('provenance')).toContainText('fingerprint matches');

  // Native back: the browse results are still there (restored from cache).
  await page.goBack();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3, { timeout: 10_000 });
});

test('a cold recipe link renders with no prior cache (shareable URLs)', async ({ page }) => {
  await routeFixtures(page);
  const uri = `at://${AUTHOR_DID}/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D`;
  await page.goto(`/recipe.html?u=${encodeURIComponent(uri)}&by=somechef.example.com`);
  await expect(page.locator('h2')).toContainText('White Chocolate Strawberry Sourdough', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('provenance')).toContainText('as published by somechef.example.com');
  // Single-version recipe (fixture has no dishKey): no flip bar (Phase 4c).
  await expect(page.getByTestId('version-bar')).toHaveCount(0);
});

test('an unresolvable handle surfaces the failure in the status line', async ({ page }) => {
  await routeFixtures(page);
  await page.goto('/');
  await page.getByTestId('add-cook').click();
  await page.getByTestId('add-cook-input').fill('definitely-not-real-xyz9.bsky.social');
  await page.getByTestId('add-cook-submit').click();
  await expect(page.getByTestId('recipes-status')).toContainText('Unable to resolve handle');
});

test('edit mode prefills the editor from a published record (Phase 8)', async ({ page }) => {
  await routeFixtures(page);
  const uri = `at://${AUTHOR_DID}/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D`;
  await page.goto(`/editor.html?edit=${encodeURIComponent(uri)}`);
  await expect(page.locator('.page-title')).toHaveText('Edit recipe', { timeout: 15_000 });
  await expect(page.getByTestId('editor-name')).toHaveValue(
    'White Chocolate Strawberry Sourdough Sweet Bread',
  );
  await expect(page.getByTestId('editor-ingredients')).toHaveValue(/bread flour/);
  await expect(page.getByTestId('publish')).toBeDisabled(); // signed out
});

test('revision staleness: same CID stays quiet; a new CID offers the latest (Phase 8)', async ({
  page,
}) => {
  await routeFixtures(page);
  const uri = `at://${AUTHOR_DID}/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D`;
  // Visit once (cold → cached), then reload with the SAME revision: the
  // background check runs and must stay quiet (the negative edge).
  await page.goto(`/recipe.html?u=${encodeURIComponent(uri)}`);
  await expect(page.locator('h2')).toContainText('White Chocolate', { timeout: 15_000 });
  await page.reload();
  await expect(page.locator('h2')).toContainText('White Chocolate');
  await page.waitForTimeout(1_500); // give the revision check time to finish
  await expect(page.getByTestId('stale-indicator')).toHaveCount(0);

  // Now the live record moves on (new CID + name): the indicator appears
  // and "Show latest" renders the new revision.
  const v2 = JSON.parse(atprotoFixture('getRecord-exchange.recipe.recipe.json')) as {
    cid: string;
    value: { name: string };
  };
  v2.cid = 'bafyreinewrevisionnewrevisionnewrevision';
  v2.value.name = 'White Chocolate Strawberry Sourdough Sweet Bread (v2)';
  await page.unroute(`${AUTHOR_PDS}/**`);
  await page.route(`${AUTHOR_PDS}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v2) }),
  );
  await page.reload();
  await expect(page.getByTestId('stale-indicator')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('refresh-recipe').click();
  await expect(page.locator('h2')).toContainText('(v2)');
});

test('intact cards are clean; detail carries the human provenance line', async ({ page }) => {
  await routeFixtures(page);
  await page.goto('/');
  await page.getByTestId('add-cook').click();
  await page.getByTestId('add-cook-input').fill('somechef.example.com');
  await page.getByTestId('add-cook-submit').click();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
  // Silent when good: no badge anywhere on intact cards.
  await expect(page.locator('.altered-stamp')).toHaveCount(0);
  // The provenance line lives in the opened detail.
  await page.getByTestId('recipe-item').first().click();
  await expect(page.getByTestId('provenance').first()).toContainText(
    'as published by somechef.example.com',
  );
  await expect(page.getByTestId('provenance').first()).toContainText('fingerprint matches');
});

// Substitutions (⇄): opt-in on the recipe page. The toggle appears only when a
// configured substitution matches a line here; checking it strikes the original
// and shows the preferred swap. The Account "always apply" pref seeds it on.
test('recipe page: Apply ⇄ toggle swaps a matching ingredient (opt-in)', async ({ page }) => {
  await routeFixtures(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'shopping-prefs',
      JSON.stringify({
        staples: [],
        aiInstructions: '',
        substitutions: [{ from: 'bread flour', to: 'almond flour' }],
        alwaysApplySubstitutions: false,
      }),
    );
  });
  const uri = `at://${AUTHOR_DID}/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D`;
  await page.goto(`/recipe.html?u=${encodeURIComponent(uri)}&by=somechef.example.com`);
  await expect(page.locator('h2')).toContainText('White Chocolate', { timeout: 15_000 });

  const ing = page.getByTestId('recipe-ingredients');
  const toggle = page.getByTestId('apply-substitutions');
  await expect(toggle).not.toBeChecked();
  await expect(ing.locator('del')).toHaveCount(0);
  await expect(ing).toContainText('500 g bread flour');

  // Check it → the flour line is struck through and the swap shows beside it.
  await toggle.check();
  await expect(ing.locator('del').first()).toHaveText('500 g bread flour');
  await expect(ing).toContainText('almond flour');

  // Unchecking restores the plain list.
  await toggle.uncheck();
  await expect(ing.locator('del')).toHaveCount(0);
});

test('recipe page: "always apply substitutions" opens with the ⇄ toggle already on', async ({
  page,
}) => {
  await routeFixtures(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'shopping-prefs',
      JSON.stringify({
        staples: [],
        aiInstructions: '',
        substitutions: [{ from: 'bread flour', to: 'almond flour' }],
        alwaysApplySubstitutions: true,
      }),
    );
  });
  const uri = `at://${AUTHOR_DID}/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D`;
  await page.goto(`/recipe.html?u=${encodeURIComponent(uri)}&by=somechef.example.com`);
  await expect(page.locator('h2')).toContainText('White Chocolate', { timeout: 15_000 });
  await expect(page.getByTestId('apply-substitutions')).toBeChecked();
  await expect(page.getByTestId('recipe-ingredients')).toContainText('almond flour');
});

// Phase 4 wiring: "Hide" sits on the recipe-title row (right of the title) and
// hiding takes an inline two-step confirm (no native dialog); Cancel reverts and
// does NOT hide; Confirm hides (the control then offers one-tap Unhide). Both
// edges asserted, exercised through the real recipe-page render.
test('Hide in the bottom footer: inline confirm hides, cancel reverts, unhide is one-tap (wiring)', async ({
  page,
}) => {
  await routeFixtures(page);
  const uri = `at://${AUTHOR_DID}/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D`;
  await page.goto(`/recipe.html?u=${encodeURIComponent(uri)}&by=somechef.example.com`);
  await expect(page.locator('h2')).toContainText('White Chocolate', { timeout: 15_000 });

  // The Hide control sits at the bottom of the detail (in line with provenance),
  // not a detached button under the image.
  const control = page.locator('.detail-footer .detail-footer-control-slot');
  const hide = control.getByTestId('hide-recipe');
  await expect(hide).toHaveText('Hide');

  // Click Hide → an inline confirm affordance (no native dialog), Hide gone.
  await hide.click();
  await expect(control.getByTestId('hide-confirm')).toBeVisible();
  await expect(control.getByTestId('hide-cancel')).toBeVisible();
  await expect(control.getByTestId('hide-recipe')).toHaveCount(0);

  // Cancel reverts to "Hide" and does NOT hide (control still offers Hide).
  await control.getByTestId('hide-cancel').click();
  await expect(control.getByTestId('hide-recipe')).toHaveText('Hide');
  await expect(control.getByTestId('hide-confirm')).toHaveCount(0);

  // Hide → Confirm actually hides: the control flips to one-tap Unhide.
  await control.getByTestId('hide-recipe').click();
  await control.getByTestId('hide-confirm').click();
  await expect(control.getByTestId('hide-recipe')).toHaveText('Unhide');

  // Unhide is one-tap (no confirm) → back to Hide.
  await control.getByTestId('hide-recipe').click();
  await expect(control.getByTestId('hide-recipe')).toHaveText('Hide');
  await expect(control.getByTestId('hide-confirm')).toHaveCount(0);
});
