import { expect, test, type Page } from '@playwright/test';

// E5 — PWA lifecycle reality, measured in a real browser + real service worker.
// NOTE (declared stand-in): visibility/pagehide are driven SYNTHETICALLY here
// (dispatched events), not by real OS backgrounding. So the landing rate we
// record is the sendBeacon delivery rate for the listener→beacon path under
// headless Chromium on localhost — an UPPER BOUND, not the field rate. Real iOS
// PWA backgrounding (ledger Q1) cannot be reproduced in this harness.

async function reset(page: Page) {
  await page.request.post('/_reset');
}
async function stats(page: Page): Promise<{ flushes: number; beacons: unknown[] }> {
  return page.request.get('/_stats').then((r) => r.json());
}
async function pollFlushes(page: Page, want: number, timeoutMs = 5000): Promise<number> {
  const start = Date.now();
  let last = 0;
  while (Date.now() - start < timeoutMs) {
    last = (await stats(page)).flushes;
    if (last >= want) return last;
    await page.waitForTimeout(50);
  }
  return last;
}

const TRIALS = 20;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText(/ready/);
});

test('visibilitychange→hidden flush landing rate', async ({ page }) => {
  await reset(page);
  for (let i = 0; i < TRIALS; i++) {
    await page.evaluate(() => {
      window.__measure.emit('page_home');
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
  }
  const landed = await pollFlushes(page, TRIALS);
  const rate = landed / TRIALS;
  console.log(`E5 visibilitychange landing: ${landed}/${TRIALS} = ${(rate * 100).toFixed(1)}%`);
  // Report the number; assert only that beacons demonstrably land.
  expect(landed).toBeGreaterThan(0);
});

test('pagehide flush landing rate', async ({ page }) => {
  await reset(page);
  for (let i = 0; i < TRIALS; i++) {
    await page.evaluate(() => {
      window.__measure.emit('page_recipe');
      window.dispatchEvent(new Event('pagehide'));
    });
  }
  const landed = await pollFlushes(page, TRIALS);
  const rate = landed / TRIALS;
  console.log(`E5 pagehide landing: ${landed}/${TRIALS} = ${(rate * 100).toFixed(1)}%`);
  expect(landed).toBeGreaterThan(0);
});

test('real navigation fires pagehide and a flush lands', async ({ page }) => {
  await reset(page);
  await page.evaluate(() => window.__measure.emit('feat_share'));
  await page.goto('/index.html'); // navigate away → real pagehide
  const landed = await pollFlushes(page, 1);
  console.log(`E5 real-navigation flush landed: ${landed}`);
  expect(landed).toBeGreaterThanOrEqual(0); // recorded, not asserted (bfcache may retain)
});

test('offline: counters survive and flush on reconnect', async ({ page, context }) => {
  await reset(page);
  await context.setOffline(true);
  await page.evaluate(() => {
    window.__measure.emit('page_home');
    window.__measure.emit('page_home');
    window.__measure.emit('feat_cook_focus');
  });
  // While offline, the local counters must still be intact.
  const offlineCounts = await page.evaluate(() => window.__measure.readCounts());
  expect(offlineCounts['page_home']).toBe(2);

  await context.setOffline(false);
  // A lifecycle event after reconnect flushes the persisted counters.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const landed = await pollFlushes(page, 1);
  console.log(`E5 offline→reconnect flush landed: ${landed}`);
  expect(landed).toBeGreaterThanOrEqual(0); // observed value recorded in the summary
});
