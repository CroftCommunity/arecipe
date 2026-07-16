// Phase 3b regression test (@live): two tabs share one session; forcing a
// refresh in one tab does not kill the other. The library provides the
// coordination (navigator.locks around refresh + BroadcastChannel sync —
// verified in source, see the plan's Phase 3b Delivered note); this test
// pins the end-state behavior so a library upgrade that loses it fails
// loudly. Assertions are on end state (both tabs authenticated), not call
// ordering, per the plan's flakiness note.
import { expect, test } from '@playwright/test';
import { readEnv, signIn } from './helpers/live.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';

test('@live two tabs survive a forced refresh (single-use refresh token hazard)', async ({
  context,
  page,
  baseURL,
}) => {
  test.skip(HANDLE === '' || PASSWORD === '', 'needs BSKY_TEST_HANDLE/PASSWORD in .env');
  // Un-fixme'd 2026-07-16 (D6): the loopback client_id is now STABLE across
  // pages — it enumerates every authed page's redirect_uri and no longer bakes
  // the initiating page's pathname in (oauth-client.ts). A token minted during
  // sign-in (on signin.html) therefore refreshes on any other authed page. This
  // test forces the refresh on mine.html — a DIFFERENT page than signin.html —
  // which is exactly the case that used to fail.
  test.setTimeout(180_000);
  const origin = baseURL ?? 'http://127.0.0.1:4173';

  // Tab 1: interactive login. Debug flag via localStorage — the URL flag
  // would be lost across the OAuth redirect round-trip.
  await page.goto('/account.html');
  await page.evaluate(() => window.localStorage.setItem('debug', '1'));
  await signIn(page, { handle: HANDLE, password: PASSWORD, origin });
  await expect(page.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });

  // Tab 2: restores the same session from the shared store, no login.
  const page2 = await context.newPage();
  await page2.goto('/account.html'); // same context → same localStorage, debug flag inherited
  await expect(page2.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });

  // Force a refresh in tab 1 — the single-use refresh token rotates. Run it on
  // mine.html, a different page than signin.html: with the stable loopback
  // client_id (D6) the token is not bound to the initiating page, so this is
  // accepted. (Before the fix it was rejected as "not issued to this client".)
  await page.goto('/mine.html');
  const refreshed = await page.evaluate(async () => {
    const dbg = (window as Window & { arecipeDebug?: { forceRefresh: () => Promise<unknown> } })
      .arecipeDebug;
    if (dbg === undefined) throw new Error('debug surface missing');
    return dbg.forceRefresh();
  });
  expect(refreshed).toBeTruthy();

  // End state: BOTH tabs remain authenticated — verify on account.html, where
  // `signed-in-did` lives (a fresh load proves the stored session is intact,
  // not just in-memory state).
  await page.goto('/account.html');
  await expect(page.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });
  await page2.reload();
  await expect(page2.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });
});
