// Shared support for the @live tier (real PDS, credentials from .env).
//
// Fill discipline (Phase 0 incident): never fill/retry an already-filled or
// disabled field — Playwright failure logs dump element state including
// values.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/** Tolerant read: .env is absent in CI, where the @live tier never runs. */
export const readEnv = (): Record<string, string> => {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split(/=(.*)/s).slice(0, 2)),
    ) as Record<string, string>;
  } catch {
    return {};
  }
};

/** Walk the third-party login/consent pages until we're back at the app. */
export const walkAuthPages = async (
  page: Page,
  appOrigin: string,
  password: string,
): Promise<void> => {
  for (let i = 0; i < 15 && !page.url().startsWith(appOrigin); i++) {
    await page.waitForTimeout(900);
    if (page.url().startsWith(appOrigin)) break;
    const pw = page.locator('input[type=password]:visible').first();
    if ((await page.locator('input[type=password]:visible').count()) > 0) {
      const enabled = await pw.isEnabled().catch(() => false);
      const already = await pw.inputValue().catch(() => 'x');
      if (enabled && already === '') {
        await pw.fill(password, { timeout: 5_000 });
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

/** Full interactive login on the given page: handle → consent walk → signed in. */
export const signIn = async (
  page: Page,
  opts: { handle: string; password: string; origin: string },
): Promise<void> => {
  await page.goto('/');
  await page.getByTestId('handle-input').fill(opts.handle);
  await page.getByTestId('oauth-signin').click();
  await page.waitForURL(/bsky\.social/, { timeout: 30_000 });
  await walkAuthPages(page, opts.origin, opts.password);
};
