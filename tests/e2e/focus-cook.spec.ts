// RUN-COOK-FOCUS wiring: focus mode as a real cook view. Hermetic (recorded
// fixtures), with navigator.wakeLock stubbed via addInitScript so we can assert
// the lock is requested on enter and released on exit without a real device.
// Covers: wake-lock request/release on the enter/exit routes, the visible wake
// status, the step-at-a-time instruction state, and that the full instruction
// list survives focus.
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

/** Stub navigator.wakeLock before any page script runs. `supported:false`
 *  installs an own-undefined property so `'wakeLock' in navigator` is true but
 *  the value is absent — the older-iOS-PWA shape the module must tolerate. */
const stubWakeLock = async (page: Page, supported: boolean): Promise<void> => {
  await page.addInitScript((isSupported) => {
    const w = window as unknown as { __wake: { requests: number; releases: number } };
    w.__wake = { requests: 0, releases: 0 };
    if (!isSupported) {
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
      return;
    }
    const makeSentinel = (): Record<string, unknown> => {
      const listeners: Array<() => void> = [];
      return {
        released: false,
        release(): Promise<void> {
          w.__wake.releases += 1;
          for (const fn of listeners.slice()) fn();
          return Promise.resolve();
        },
        addEventListener(type: string, fn: () => void): void {
          if (type === 'release') listeners.push(fn);
        },
        removeEventListener(): void {
          /* no-op */
        },
      };
    };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request(): Promise<Record<string, unknown>> {
          w.__wake.requests += 1;
          return Promise.resolve(makeSentinel());
        },
      },
    });
  }, supported);
};

const openDetail = async (page: Page): Promise<void> => {
  await routeFixtures(page);
  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}&by=somechef.example.com`);
  await expect(page.locator('h2.recipe-title')).toContainText('White Chocolate', { timeout: 15_000 });
};

const wakeCounts = (page: Page): Promise<{ requests: number; releases: number }> =>
  page.evaluate(() => (window as unknown as { __wake: { requests: number; releases: number } }).__wake);

test('entering focus requests a screen wake lock exactly once', async ({ page }) => {
  await stubWakeLock(page, true);
  await openDetail(page);
  await page.getByTestId('focus-btn').click();
  await expect(page.getByTestId('focus-view')).toBeVisible();
  await expect.poll(async () => (await wakeCounts(page)).requests).toBe(1);
});

test('exiting focus via the Exit button releases the wake lock', async ({ page }) => {
  await stubWakeLock(page, true);
  await openDetail(page);
  await page.getByTestId('focus-btn').click();
  await expect.poll(async () => (await wakeCounts(page)).requests).toBe(1);
  await page.getByTestId('focus-exit').click();
  await expect(page.getByTestId('focus-view')).toHaveCount(0);
  await expect.poll(async () => (await wakeCounts(page)).releases).toBe(1);
});

test('exiting focus via Escape releases the wake lock', async ({ page }) => {
  await stubWakeLock(page, true);
  await openDetail(page);
  await page.getByTestId('focus-btn').click();
  await expect.poll(async () => (await wakeCounts(page)).requests).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('focus-view')).toHaveCount(0);
  await expect.poll(async () => (await wakeCounts(page)).releases).toBe(1);
});

test('the wake-state status is non-empty while the lock is held', async ({ page }) => {
  await stubWakeLock(page, true);
  await openDetail(page);
  await page.getByTestId('focus-btn').click();
  const wakeState = page.getByTestId('wake-state');
  await expect(wakeState).toHaveText(/staying on/i);
});

test('the wake-state status is empty when the wake lock is unsupported', async ({ page }) => {
  await stubWakeLock(page, false);
  await openDetail(page);
  await page.getByTestId('focus-btn').click();
  await expect(page.getByTestId('focus-view')).toBeVisible();
  // present in the DOM, but renders nothing — no nag on unsupported browsers.
  await expect(page.getByTestId('wake-state')).toHaveText('');
});

test('Step Next moves aria-current="step" from the first step to the second', async ({ page }) => {
  await stubWakeLock(page, true);
  await openDetail(page);
  await page.getByTestId('focus-btn').click();
  const steps = page.getByTestId('focus-instructions').locator('li');
  await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step');
  await expect(steps.nth(1)).not.toHaveAttribute('aria-current', 'step');
  await page.getByTestId('step-next').click();
  await expect(steps.nth(0)).not.toHaveAttribute('aria-current', 'step');
  await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step');
});

test('the complete instruction list survives focus mode', async ({ page }) => {
  await stubWakeLock(page, true);
  await openDetail(page);
  // The detail's own instruction count, before focus.
  const detailCount = await page.getByTestId('recipe-instructions').locator('li').count();
  expect(detailCount).toBeGreaterThan(1);
  await page.getByTestId('focus-btn').click();
  await expect(page.getByTestId('focus-instructions').locator('li')).toHaveCount(detailCount);
});
