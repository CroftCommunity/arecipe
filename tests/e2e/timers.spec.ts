// Feature A (timers) — page wiring, persistence across navigation, the
// focus-mode strip, notification-permission hygiene, and entry points.
// Hermetic: the timers page itself needs no network; the focus test reuses the
// recorded recipe fixtures (as focus-cook.spec.ts does).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');
const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');

const AUTHOR_DID = 'did:plc:26tsx5juuss4yealylyfbj4h';
const AUTHOR_PDS = 'https://morel.us-east.host.bsky.network';
const RECIPE_URI = `at://${AUTHOR_DID}/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D`;

const routeFixtures = async (page: Page): Promise<void> => {
  await page.route('https://public.api.bsky.app/**', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: identityFixture('resolveHandle-unresolvable.json'),
    });
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
        isSingle ? 'getRecord-exchange.recipe.recipe.json' : 'listRecords-exchange.recipe.recipe.json',
      ),
    });
  });
};

/** Count Notification.requestPermission calls, without ever granting. Installed
 *  before any page script runs so a request-on-load would be caught. */
const stubNotification = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const w = window as unknown as { __notif: { requests: number } };
    w.__notif = { requests: 0 };
    const Ctor = function (): void {
      /* no-op notification */
    } as unknown as { permission: string; requestPermission: () => Promise<string> };
    Ctor.permission = 'default';
    Ctor.requestPermission = (): Promise<string> => {
      w.__notif.requests += 1;
      return Promise.resolve('denied');
    };
    Object.defineProperty(window, 'Notification', { configurable: true, value: Ctor });
  });
};

const notifCount = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __notif: { requests: number } }).__notif.requests);

const startTimer = async (page: Page, minutes: number, label: string): Promise<void> => {
  await page.getByTestId('timer-label').fill(label);
  await page.getByTestId('timer-minutes').fill(String(minutes));
  await page.getByTestId('timer-start').click();
};

test('a running timer survives navigating away and back, with correct remaining', async ({ page }) => {
  await page.goto('/timers.html');
  await startTimer(page, 10, 'rice');
  await expect(page.getByTestId('timer-item')).toHaveCount(1);

  // Leave the timer page entirely, then return: the timer reloads from
  // IndexedDB and is recomputed against the clock — no stored countdown.
  await page.goto('/reference.html');
  await page.goBack();

  const item = page.getByTestId('timer-item').first();
  await expect(item).toBeVisible();
  // ~10:00, minus at most a couple of seconds of navigation time.
  await expect(item.getByTestId('timer-remaining')).toHaveText(/^(10:00|9:5\d)$/);
});

test('the focus timer strip appears when a timer runs and is absent when none run', async ({ page }) => {
  // No timers yet → strip absent in focus mode.
  await routeFixtures(page);
  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}&by=somechef.example.com`);
  await expect(page.locator('h2.recipe-title')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('focus-btn').click();
  await expect(page.getByTestId('focus-view')).toBeVisible();
  await expect(page.getByTestId('timer-strip')).toHaveCount(0);
});

test('a running timer shows in the focus strip', async ({ page }) => {
  // Start a timer, then open a recipe and enter focus: the strip surfaces it.
  await page.goto('/timers.html');
  await startTimer(page, 15, 'sauce');
  await expect(page.getByTestId('timer-item')).toHaveCount(1);

  await routeFixtures(page);
  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}&by=somechef.example.com`);
  await expect(page.locator('h2.recipe-title')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('focus-btn').click();
  await expect(page.getByTestId('focus-view')).toBeVisible();

  const strip = page.getByTestId('timer-strip');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('sauce');
});

test('notification permission is not requested on load, only after opting in', async ({ page }) => {
  await stubNotification(page);
  await page.goto('/timers.html');
  // Merely loading the page must not touch permission.
  expect(await notifCount(page)).toBe(0);

  // Turning the notify toggle on is the only thing that may request it. (A
  // click, not .check(): the stub denies, and a denial correctly reverts the
  // box to unchecked — a permanent silent no — which .check()'s state assertion
  // would reject. What we assert is that the request fired exactly once.)
  await page.getByTestId('timer-notify').click();
  await expect.poll(async () => await notifCount(page)).toBe(1);
});

test('both the nav and the reference page link to the timers page', async ({ page }) => {
  // Nav tab (desktop viewport → present and pointing at timers.html).
  await page.goto('/reference.html');
  const navLink = page.getByTestId('tab-timers');
  await expect(navLink).toHaveAttribute('href', /timers\.html$/);

  // A link on the reference page itself.
  const refLink = page.getByTestId('timers-link');
  await expect(refLink).toHaveAttribute('href', /timers\.html$/);
});
