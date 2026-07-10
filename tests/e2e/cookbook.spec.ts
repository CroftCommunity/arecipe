// CB3 wiring (hermetic half): the Cookbook page (renamed from Friends; the
// app.arecipe.friend graph is gone). Mirrors the 9a split — the signed-in
// membership/feed is exercised @live; here, with no credentials, we prove:
//   - the Cookbook tab exists and navigates from Browse
//   - signed-out, the page shows the sign-in gate
//   - the READ feed renders via the shareable cookbook.html?did=<did> cold-view,
//     over routed fixtures: the viewed account's Bluesky FOLLOW is resolved as a
//     cookbook member and that cook's recipes fill the feed (resolveCookbook
//     reached from the page entry point)
//   - the legacy friends.html redirects to cookbook.html (query preserved)
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');
const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

const VIEWED = { did: 'did:plc:viewed0000000000000000aa', pds: 'https://viewed.test' };
const FOLLOW = { did: 'did:plc:follow0000000000000000aa', pds: 'https://follow.test' };
const pdsByDid: Record<string, string> = { [VIEWED.did]: VIEWED.pds, [FOLLOW.did]: FOLLOW.pds };

// Route the cookbook sources: plc.directory (only VIEWED + FOLLOW resolve;
// starter DIDs 404 → degrade), getFollowers (empty), and listRecords dispatched
// by collection (VIEWED's follows → FOLLOW; FOLLOW's recipes → the mixed
// fixture; everything else empty).
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
  // Followers: the accepted AppView dependency — empty for this test.
  await page.route('https://public.api.bsky.app/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ followers: [] }) });
  });
  // listRecords dispatched by collection + repo.
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

test('the Cookbook tab exists; signed-out it redirects to Browse (wiring)', async ({ page }) => {
  await page.goto('/');
  const tab = page.getByTestId('tab-cookbook');
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await expect(tab).toHaveAttribute('href', /cookbook\.html$/);
  await tab.click();
  // Signed-out, the cookbook is a signed-in surface → bounce to Browse (OQ10).
  await expect(page).toHaveURL(/\/index\.html$/, { timeout: 15_000 });
});

test('signed-out, the cookbook page redirects to Browse (OQ10)', async ({ page }) => {
  // Anonymous visitors go to Browse — the cookbook is a signed-in surface now,
  // and the members list moved to Account.
  await page.goto('/cookbook.html');
  await expect(page).toHaveURL(/\/index\.html$/, { timeout: 15_000 });
});

test('cookbook.html?did= renders the feed only — members moved to Account (OQ10)', async ({
  page,
}) => {
  await routeCookbookFixtures(page);
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  // The follow's recipes fill the feed (proves resolveCookbook → feed wiring)...
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  // ...but the cold-view no longer renders the members list (it lives on Account).
  await expect(page.getByTestId('cookbook-member')).toHaveCount(0);
  await expect(page.getByTestId('cookbook-members')).toHaveCount(0);
});

test('legacy friends.html redirects to cookbook.html (query preserved)', async ({ page }) => {
  await page.goto(`/friends.html?did=${encodeURIComponent(VIEWED.did)}`);
  await expect(page).toHaveURL(new RegExp(`/cookbook\\.html\\?did=`), { timeout: 15_000 });
});
