// Phase 5 (@live): the spec's first milestone — the same account signed in
// on two DEVICES (independent browser contexts: separate IndexedDB, separate
// DPoP keys, separate OAuth sessions) renders the same recipes. Also pins
// the D1-flagged risk: the two sessions refresh independently — one
// device's refresh must not disturb the other (unlike tabs, nothing is
// shared here; each context holds its own single-use refresh token).
import { expect, test, type Page } from '@playwright/test';
import { readEnv, signIn } from './helpers/live.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';

// A real recipe.exchange author with a stable public recipe set (D2/D4).
const AUTHOR = 'rdur.dev';

const findRecipes = async (page: Page): Promise<string[]> => {
  await page.goto('/'); // browsing lives on the Browse document (5b)
  await page.getByTestId('add-cook').click();
  await page.getByTestId('add-cook-input').fill(AUTHOR);
  await page.getByTestId('add-cook-submit').click();
  await expect(page.getByTestId('recipes-status')).toContainText('recipes cached', {
    timeout: 20_000,
  });
  return page.locator('[data-testid=recipe-item] .card-title').allTextContents();
};

test('@live two devices: same account, independent sessions, same recipes', async ({
  browser,
  page,
  baseURL,
}) => {
  test.skip(HANDLE === '' || PASSWORD === '', 'needs BSKY_TEST_HANDLE/PASSWORD in .env');
  // Un-fixme'd 2026-07-16 (D6): the loopback client_id is now stable across
  // pages (oauth-client.ts enumerates every authed page's redirect_uri), so a
  // token minted during sign-in refreshes on any other authed page. Production/
  // hosted (one fixed client_id) was always unaffected.
  test.setTimeout(300_000);
  const origin = baseURL ?? 'http://127.0.0.1:4173';

  // Device 1: full interactive login (default context).
  await page.goto('/account.html');
  await page.evaluate(() => window.localStorage.setItem('debug', '1'));
  await signIn(page, { handle: HANDLE, password: PASSWORD, origin });
  await expect(page.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });

  // Device 2: a NEW context — nothing shared with device 1. Full login again.
  const device2 = await browser.newContext({ baseURL: origin });
  const page2 = await device2.newPage();
  await signIn(page2, { handle: HANDLE, password: PASSWORD, origin });
  await expect(page2.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });

  // Both devices render the same account's view of the same recipe set.
  const titles1 = await findRecipes(page);
  const titles2 = await findRecipes(page2);
  expect(titles1.length).toBeGreaterThan(0);
  expect(titles2).toEqual(titles1);
  await expect(page.getByTestId('recipes-status')).toHaveText(
    await page2.getByTestId('recipes-status').innerText(),
  );

  // Independent refresh (D1 risk): rotating device 1's single-use refresh
  // token must not disturb device 2's session. The debug hook lives on
  // auth-aware pages (5b); with the stable loopback client_id (D6) the refresh
  // may run on any authed page — mine.html here, a different page than
  // signin.html, which is exactly the case the old pathname-pinned client_id
  // rejected as "not issued to this client".
  await page.goto('/mine.html');
  const refreshed = await page.evaluate(async () => {
    const dbg = (window as Window & { arecipeDebug?: { forceRefresh: () => Promise<unknown> } })
      .arecipeDebug;
    if (dbg === undefined) throw new Error('debug surface missing');
    return dbg.forceRefresh();
  });
  expect(refreshed).toBeTruthy();

  // Both sessions survive — verify on account.html, where `signed-in-did` lives.
  await page2.goto('/account.html');
  await expect(page2.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });
  await page.goto('/account.html');
  await expect(page.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });

  await device2.close();
});
