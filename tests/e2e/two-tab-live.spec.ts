// Phase 3b regression test (@live): two tabs share one session; forcing a
// refresh in one tab does not kill the other. The library provides the
// coordination (navigator.locks around refresh + BroadcastChannel sync —
// verified in source, see the plan's Phase 3b Delivered note); this test
// pins the end-state behavior so a library upgrade that loses it fails
// loudly. Assertions are on end state (both tabs authenticated), not call
// ordering, per the plan's flakiness note.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
) as Record<string, string>;

const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';

const walkAuthPages = async (page: Page, appOrigin: string): Promise<void> => {
  for (let i = 0; i < 15 && !page.url().startsWith(appOrigin); i++) {
    await page.waitForTimeout(900);
    if (page.url().startsWith(appOrigin)) break;
    const pw = page.locator('input[type=password]:visible').first();
    if ((await page.locator('input[type=password]:visible').count()) > 0) {
      const enabled = await pw.isEnabled().catch(() => false);
      const already = await pw.inputValue().catch(() => 'x');
      if (enabled && already === '') {
        await pw.fill(PASSWORD, { timeout: 5_000 });
        await page
          .locator('button:has-text("Sign in"):visible, button[type=submit]:visible')
          .first()
          .click({ timeout: 5_000 });
      }
    } else {
      const authorize = page
        .locator('button:has-text("Authorize"):visible, button:has-text("Accept"):visible')
        .first();
      if ((await authorize.count()) > 0) await authorize.click({ timeout: 5_000 }).catch(() => {});
    }
  }
};

test('@live two tabs survive a forced refresh (single-use refresh token hazard)', async ({
  context,
  page,
  baseURL,
}) => {
  test.skip(HANDLE === '' || PASSWORD === '', 'needs BSKY_TEST_HANDLE/PASSWORD in .env');
  test.setTimeout(180_000);
  const origin = baseURL ?? 'http://127.0.0.1:4173';

  // Tab 1: interactive login. Debug flag via localStorage — the URL flag
  // would be lost across the OAuth redirect round-trip.
  await page.goto('/');
  await page.evaluate(() => window.localStorage.setItem('debug', '1'));
  await page.reload();
  await page.getByTestId('handle-input').fill(HANDLE);
  await page.getByTestId('oauth-signin').click();
  await page.waitForURL(/bsky\.social/, { timeout: 30_000 });
  await walkAuthPages(page, origin);
  await expect(page.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });

  // Tab 2: restores the same session from the shared store, no login.
  const page2 = await context.newPage();
  await page2.goto('/'); // same context → same localStorage, debug flag inherited
  await expect(page2.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });

  // Force a refresh in tab 1 — the single-use refresh token rotates.
  const refreshed = await page.evaluate(async () => {
    const dbg = (window as Window & { arecipeDebug?: { forceRefresh: () => Promise<unknown> } })
      .arecipeDebug;
    if (dbg === undefined) throw new Error('debug surface missing');
    return dbg.forceRefresh();
  });
  expect(refreshed).toBeTruthy();

  // End state: BOTH tabs remain authenticated (reload each to prove the
  // stored session is intact, not just in-memory state).
  await page.reload();
  await expect(page.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });
  await page2.reload();
  await expect(page2.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });
});
