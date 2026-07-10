// Phase 9b wiring (hermetic half): threaded comments on the recipe page.
// Mirrors 9a's split — the WRITE (compose/reply) is proven @live; here, with
// no credentials, we prove the friends-scoped READ path: signed-out, the recipe
// page discovers the recipe author's own comments (author PDS already resolved)
// and renders them threaded, and shows no compose box. Reply nesting is proven
// by the fixture's parent AT-URI.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');
const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');

const AUTHOR_DID = 'did:plc:26tsx5juuss4yealylyfbj4h';
const AUTHOR_PDS = 'https://morel.us-east.host.bsky.network';
const RECIPE_RKEY = '01JQJ5RW51ZVEW72XN6GSRWC8D';
const RECIPE_URI = `at://${AUTHOR_DID}/exchange.recipe.recipe/${RECIPE_RKEY}`;
const COMMENT_COLLECTION = 'app.arecipe.comment';

const routeFixtures = async (page: Page): Promise<void> => {
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
    const url = route.request().url();
    if (url.includes('getRecord')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: atprotoFixture('getRecord-exchange.recipe.recipe.json'),
      });
    }
    if (url.includes(encodeURIComponent(COMMENT_COLLECTION)) || url.includes(COMMENT_COLLECTION)) {
      const parentUri = `at://${AUTHOR_DID}/${COMMENT_COLLECTION}/cp`;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          records: [
            {
              uri: parentUri,
              cid: 'bafyreicp',
              value: {
                recipe: { uri: RECIPE_URI, cid: 'bafyreirecipe' },
                text: 'This became my go-to bread.',
                createdAt: '2026-07-08T00:00:01Z',
              },
            },
            {
              uri: `at://${AUTHOR_DID}/${COMMENT_COLLECTION}/cc`,
              cid: 'bafyreicc',
              value: {
                recipe: { uri: RECIPE_URI, cid: 'bafyreirecipe' },
                text: 'Second batch even better.',
                parent: parentUri,
                createdAt: '2026-07-08T00:00:02Z',
              },
            },
          ],
        }),
      });
    }
    // Recipe list (if requested)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: atprotoFixture('listRecords-exchange.recipe.recipe.json'),
    });
  });
};

test('signed-out recipe page renders the author’s comments threaded (wiring)', async ({ page }) => {
  await routeFixtures(page);
  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}`);
  await expect(page.locator('h2')).toContainText('White Chocolate', { timeout: 15_000 });
  await expect(page.getByTestId('comment-item')).toHaveCount(2);
  // The reply nests inside the root comment (thread structure).
  const root = page.getByTestId('comment-item').first();
  await expect(root.getByTestId('comment-item')).toContainText('Second batch even better.');
});

test('signed-out, there is no compose box — a sign-in note instead', async ({ page }) => {
  await routeFixtures(page);
  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}`);
  await expect(page.getByTestId('comment-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('comment-compose')).toHaveCount(0);
  await expect(page.getByTestId('comment-signed-out')).toBeVisible();
});

// Phase 1 wiring: content links (the commenter handle) must read in the themed
// enamel color, not UA link-blue (unreadable on the dark --tile). We assert the
// discriminating facts rather than a hardcoded hex (robust to a token retune):
// the .comment-author computed color EQUALS a known --enamel-bearing element
// (.nav-auth, always in the topbar) and is NOT the UA blue it defaults to today.
// Exercised through the real recipe-page render, in both themes.
for (const scheme of ['light', 'dark'] as const) {
  test(`comment-author link uses the themed enamel color, not UA blue (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await routeFixtures(page);
    await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}`);
    await expect(page.getByTestId('comment-author').first()).toBeVisible({ timeout: 15_000 });

    const colorOf = (testid: string): Promise<string> =>
      page.evaluate(
        (id) =>
          getComputedStyle(document.querySelector(`[data-testid="${id}"]`)!).color,
        testid,
      );
    const commentAuthor = await colorOf('comment-author');
    // .nav-auth is the always-present topbar link that already resolves --enamel;
    // signed-out it carries the nav-signin testid.
    const enamelReference = await colorOf('nav-signin');

    // Same themed color as the enamel reference…
    expect(commentAuthor).toBe(enamelReference);
    // …and not the UA link blue it falls back to without a color rule.
    expect(commentAuthor).not.toBe('rgb(0, 0, 238)');
  });
}
