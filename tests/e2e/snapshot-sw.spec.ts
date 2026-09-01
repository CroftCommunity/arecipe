// D5: the snapshot ships in the precache and is served from the Cache API. On
// first load the service worker precaches the versioned snapshot files; a fetch
// for the snapshot index then resolves from cache with no network — proven by
// fetching it while offline.
import { expect, test } from '@playwright/test';

test('the precached snapshot index is in the Cache API and served offline (no network)', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);

  // The active build's snapshot index is precached into the Cache API.
  const version = await page.evaluate(async () => {
    const info = (await (await fetch('/build-info.json')).json()) as { version: string };
    for (let i = 0; i < 50; i += 1) {
      const hit = await caches.match(`/assets/snapshot/${info.version}/index.json`);
      if (hit !== undefined) return info.version;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  });
  expect(version).not.toBeNull();

  // Served from the Cache API with the network cut off → it came from the bundle.
  await context.setOffline(true);
  const status = await page.evaluate(async (v) => {
    const res = await fetch(`/assets/snapshot/${v}/index.json`);
    return res.status;
  }, version);
  expect(status).toBe(200);
});
