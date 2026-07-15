// Phase 8b wiring: the offline shell. Load once (SW precaches the shell,
// the find caches recipes in IndexedDB), go offline, reload — the app and
// the recipes are still there.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');
const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');

const AUTHOR_DID = 'did:plc:26tsx5juuss4yealylyfbj4h';
const AUTHOR_PDS = 'https://morel.us-east.host.bsky.network';

// A freshly-claimed SW needs a brief moment before it serves the next
// offline navigation. A real user going offline has far more settle time
// than a test that reloads immediately, so retry a couple times.
const reloadOffline = async (page: Page): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    try {
      await page.reload();
      return;
    } catch (err) {
      if (i === 3) throw err;
      await page.waitForTimeout(500);
    }
  }
};

const routeFixtures = async (page: Page): Promise<void> => {
  await page.route('https://public.api.bsky.app/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ did: AUTHOR_DID }),
    }),
  );
  await page.route('https://plc.directory/**', async (route) => {
    const doc = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
      id: string;
      service: { serviceEndpoint: string }[];
    };
    doc.id = AUTHOR_DID;
    doc.service[0]!.serviceEndpoint = AUTHOR_PDS;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  await page.route(`${AUTHOR_PDS}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: atprotoFixture('listRecords-exchange.recipe.recipe.json'),
    }),
  );
};

test('the starter feed itself survives offline via cached copies (8b)', async ({ page }) => {
  // Route the starter authors (all four) so the feed populates the cache.
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    service: { serviceEndpoint: string }[];
  };
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    const doc = { ...template, id: did, service: [{ ...template.service[0]!, serviceEndpoint: AUTHOR_PDS }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  await page.route(`${AUTHOR_PDS}/**`, async (route) => {
    // Distinct URIs per requesting repo so cards don't collide.
    const repo = new URL(route.request().url()).searchParams.get('repo') ?? 'x';
    const list = JSON.parse(atprotoFixture('listRecords-exchange.recipe.recipe.json')) as {
      records: { uri: string }[];
    };
    for (const r of list.records) r.uri = r.uri.replace(/did:plc:[a-z0-9]+/, repo);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) });
  });

  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(12, { timeout: 20_000 });
  await page.waitForFunction(
    async () => {
      if (navigator.serviceWorker.controller === null) return false;
      const keys = await caches.keys();
      const name = keys.find((k) => k.startsWith('arecipe-'));
      if (name === undefined) return false;
      return (await (await caches.open(name)).keys()).length >= 20;
    },
    null,
    { timeout: 20_000 },
  );

  // Truly offline: drop the routes (Playwright routes otherwise keep serving
  // matched cross-origin URLs even under setOffline) so the feed's network
  // genuinely fails and must fall back to the IndexedDB cache.
  await page.unroute('https://plc.directory/**');
  await page.unroute(`${AUTHOR_PDS}/**`);
  await page.context().setOffline(true);
  await reloadOffline(page);
  await expect(page.locator('h1')).toHaveText('arecipe', { timeout: 15_000 });
  // The feed must fall back to the cached copies — not render empty.
  await expect(page.getByTestId('recipe-item')).toHaveCount(12, { timeout: 15_000 });
  await expect(page.getByTestId('recipes-status')).toContainText('saved copies');
  await page.context().setOffline(false);
});

test('the shell and cached recipes survive going offline (8b wiring)', async ({ page }) => {
  await routeFixtures(page);
  await page.goto('/');
  // Search (fills the IndexedDB cache + sessionStorage last-find).
  await page.getByTestId('add-cook').click();
  await page.getByTestId('add-cook-input').fill('somechef.example.com');
  await page.getByTestId('add-cook-submit').click();
  await expect(page.getByTestId('recipe-item')).toHaveCount(3, { timeout: 15_000 });

  // Wait until the SW is active AND the shell precache is populated.
  await page.waitForFunction(
    async () => {
      if (navigator.serviceWorker.controller === null) return false;
      const keys = await caches.keys();
      const name = keys.find((k) => k.startsWith('arecipe-'));
      if (name === undefined) return false;
      const cache = await caches.open(name);
      return (await cache.keys()).length >= 20;
    },
    null,
    { timeout: 20_000 },
  );

  // Airplane mode.
  await page.context().setOffline(true);
  await reloadOffline(page);
  // Shell renders from the SW cache; results restore from IndexedDB.
  await expect(page.locator('h1')).toHaveText('arecipe');
  await expect(page.getByTestId('recipe-item')).toHaveCount(3, { timeout: 15_000 });
  await page.context().setOffline(false);
});
