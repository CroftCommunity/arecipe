// Phase 3 wiring test (@live tier): a real OAuth login against the real PDS,
// then a reload proving the session persists (library-owned IndexedDB store).
// Runs via `npm run test:live` with the out-of-band credential in .env —
// NEVER in push CI (drives bsky.social's third-party login/consent pages).
//
// Fill discipline (Phase 0 incident): never fill/retry an already-filled or
// disabled field — Playwright failure logs dump element state including
// values.
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
    const pwVisible = (await page.locator('input[type=password]:visible').count()) > 0;
    if (pwVisible) {
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

test('@live login persists across a reload (loopback OAuth, real PDS)', async ({ page, baseURL }) => {
  test.skip(HANDLE === '' || PASSWORD === '', 'needs BSKY_TEST_HANDLE/PASSWORD in .env');
  test.setTimeout(120_000);

  await page.goto('/');
  await page.getByTestId('handle-input').fill(HANDLE);
  await page.getByTestId('oauth-signin').click();

  await page.waitForURL(/bsky\.social/, { timeout: 30_000 });
  await walkAuthPages(page, baseURL ?? 'http://127.0.0.1:4173');

  // Back in the app with a live session.
  await expect(page.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });

  // The wiring claim: persistence across a reload, no re-login.
  await page.reload();
  await expect(page.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });
});
