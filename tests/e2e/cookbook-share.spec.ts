// Share affordances (hermetic): the cookbook page shows a one-tap Share button
// on the shareable ?did=<did> cold-view, copying the canonical
// cookbook.html?did=<did> URL for the cookbook being viewed. As with the recipe
// share, navigator.share is deleted before load so the deterministic clipboard
// fallback runs. Routing mirrors cookbook.spec's cold-view fixtures.
//
// SCOPED OUT (hermetic): the signed-in OWN-cookbook view. The hermetic cookbook
// harness fakes no session — signed-out visits redirect to Browse and the own
// feed is exercised only @live (see cookbook.spec.ts). The own-view Share button
// is implemented the same way (using agent.did) but asserting it needs @live, so
// that assertion is out of this hermetic spec (recorded in RUN-SHARE-SUMMARY.md).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');
const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

const VIEWED = { did: 'did:plc:viewed0000000000000000aa', pds: 'https://viewed.test' };
const FOLLOW = { did: 'did:plc:follow0000000000000000aa', pds: 'https://follow.test' };
const pdsByDid: Record<string, string> = { [VIEWED.did]: VIEWED.pds, [FOLLOW.did]: FOLLOW.pds };

const routeCookbookFixtures = async (page: Page): Promise<void> => {
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    alsoKnownAs?: string[];
    service: { serviceEndpoint: string }[];
  };
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    const pds = pdsByDid[did];
    if (pds === undefined) return route.fulfill({ status: 404, body: '{}' });
    const doc = {
      ...template,
      id: did,
      alsoKnownAs: [`at://${did === FOLLOW.did ? 'follow.example.com' : 'viewed.example.com'}`],
      service: [{ ...template.service[0]!, serviceEndpoint: pds }],
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  await page.route('https://public.api.bsky.app/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ followers: [] }) });
  });
  const routeListRecords = async (route: import('@playwright/test').Route): Promise<void> => {
    const url = new URL(route.request().url());
    const collection = url.searchParams.get('collection');
    const repo = url.searchParams.get('repo');
    if (collection === 'app.bsky.graph.follow' && repo === VIEWED.did) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ records: [{ uri: `at://${VIEWED.did}/app.bsky.graph.follow/rk1`, value: { subject: FOLLOW.did, createdAt: '2026-07-08T00:00:00Z' } }] }),
      });
    }
    if (collection === 'exchange.recipe.recipe' && repo === FOLLOW.did) {
      const list = JSON.parse(atprotoFixture('listRecords-browse-mixed.json')) as {
        records: { uri: string }[];
      };
      for (const r of list.records) r.uri = r.uri.replace(/did:plc:[a-z0-9]+/, FOLLOW.did);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
  };
  for (const pds of Object.values(pdsByDid)) {
    await page.route(`${pds}/**`, async (route) => {
      if (route.request().url().includes('com.atproto.repo.listRecords')) return routeListRecords(route);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
    });
  }
};

const forceClipboardFallback = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    try {
      // @ts-expect-error — removing an optional web API for the test
      delete navigator.share;
    } catch {
      /* non-configurable on some engines — the feature-detect still guards */
    }
  });
};

test('the cookbook cold-view shows a Share button that copies the canonical cookbook URL (wiring)', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await forceClipboardFallback(page);
  await routeCookbookFixtures(page);
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  // Feed loads → the header (with the Share button) is mounted.
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });

  const share = page.getByTestId('share-cookbook');
  await expect(share).toBeVisible();
  await expect(share).toHaveAttribute('aria-label', /share/i);

  const origin = new URL(page.url()).origin;
  const expected = `${origin}/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`;
  await expect(share).toHaveAttribute('data-copy', expected);

  await share.click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(expected);

  await expect(share).toContainText(/copied/i);
});
