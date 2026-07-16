// CB3 wiring (hermetic half): the Cookbook page (renamed from Friends; the
// app.arecipe.friend graph is gone). Mirrors the 9a split — the signed-in
// membership/feed is exercised @live; here, with no credentials, we prove:
//   - the Cookbook tab exists and navigates from Browse
//   - signed-out, the page shows the sign-in gate
//   - the READ feed renders via the shareable cookbook.html?did=<did> shared
//     view, over routed fixtures: the shared cookbook is EXACTLY the viewed
//     account's own recipes + their liked recipes (owner decision 2026-07-16) —
//     their follow graph is routed but must no longer feed the view
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

// Route the shared-cookbook sources (shared = exactly the owner's recipes +
// their likes): plc.directory (only VIEWED + FOLLOW resolve), VIEWED's own
// recipes (the mixed fixture's first two), VIEWED's `liked` interactions on two
// of FOLLOW's recipes (getRecord'd per ref), and an un-liked "Follow-Only Dish"
// on FOLLOW that must never appear. VIEWED's follow graph stays routed to prove
// the shared feed no longer consults it.
type FixtureRecord = { uri: string; cid: string; value: Record<string, unknown> };

const cookbookFixtureRecords = (): {
  viewedOwn: FixtureRecord[];
  liked: FixtureRecord[];
  followOnly: FixtureRecord;
  likes: FixtureRecord[];
} => {
  const mixed = JSON.parse(atprotoFixture('listRecords-browse-mixed.json')) as {
    records: FixtureRecord[];
  };
  const rekeyed = (index: number, did: string): FixtureRecord => {
    const r = mixed.records[index]!;
    return { ...r, uri: r.uri.replace(/did:plc:[a-z0-9]+/, did) };
  };
  // VIEWED published Greek Salad + American Pancakes; FOLLOW published Italian
  // Minestrone + Greek Vegan Lunch Bowl (both liked by VIEWED) and the un-liked
  // Follow-Only Dish.
  const viewedOwn = [rekeyed(0, VIEWED.did), rekeyed(1, VIEWED.did)];
  const liked = [rekeyed(2, FOLLOW.did), rekeyed(3, FOLLOW.did)];
  const followOnly: FixtureRecord = {
    uri: `at://${FOLLOW.did}/exchange.recipe.recipe/followonly0001`,
    cid: 'bafyreifollowonly0001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    value: { ...mixed.records[1]!.value, name: 'Follow-Only Dish' },
  };
  const likes = liked.map((r, i) => ({
    uri: `at://${VIEWED.did}/app.arecipe.interaction/like${i + 1}`,
    cid: `bafyreilike000${i + 1}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
    value: {
      $type: 'app.arecipe.interaction',
      kind: 'liked',
      recipe: { uri: r.uri, cid: r.cid },
      createdAt: '2026-07-10T00:00:00Z',
    },
  }));
  return { viewedOwn, liked, followOnly, likes };
};

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
  // Followers: the accepted AppView dependency — empty (and unused by the feed).
  await page.route('https://public.api.bsky.app/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ followers: [] }) });
  });
  const { viewedOwn, liked, followOnly, likes } = cookbookFixtureRecords();
  const json = (records: unknown): { status: number; contentType: string; body: string } => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(records),
  });
  // listRecords dispatched by collection + repo.
  const routeListRecords = async (route: import('@playwright/test').Route): Promise<void> => {
    const url = new URL(route.request().url());
    const collection = url.searchParams.get('collection');
    const repo = url.searchParams.get('repo');
    if (collection === 'exchange.recipe.recipe' && repo === VIEWED.did) {
      return route.fulfill(json({ records: viewedOwn }));
    }
    if (collection === 'app.arecipe.interaction' && repo === VIEWED.did) {
      return route.fulfill(json({ records: likes }));
    }
    if (collection === 'app.bsky.graph.follow' && repo === VIEWED.did) {
      // Still routed: the shared feed must NOT be built from follows anymore.
      return route.fulfill(
        json({ records: [{ uri: `at://${VIEWED.did}/app.bsky.graph.follow/rk1`, value: { subject: FOLLOW.did, createdAt: '2026-07-08T00:00:00Z' } }] }),
      );
    }
    if (collection === 'exchange.recipe.recipe' && repo === FOLLOW.did) {
      return route.fulfill(json({ records: [...liked, followOnly] }));
    }
    return route.fulfill(json({ records: [] }));
  };
  // getRecord (the liked refs, fetched per uri by loadLikedFeed).
  const routeGetRecord = async (route: import('@playwright/test').Route): Promise<void> => {
    const rkey = new URL(route.request().url()).searchParams.get('rkey');
    const match = [...viewedOwn, ...liked, followOnly].find((r) => r.uri.endsWith(`/${rkey ?? ''}`));
    if (match === undefined) return route.fulfill({ status: 404, body: '{}' });
    return route.fulfill(json(match));
  };
  for (const pds of Object.values(pdsByDid)) {
    await page.route(`${pds}/**`, async (route) => {
      const url = route.request().url();
      if (url.includes('com.atproto.repo.listRecords')) return routeListRecords(route);
      if (url.includes('com.atproto.repo.getRecord')) return routeGetRecord(route);
      return route.fulfill(json({ records: [] }));
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
  // The owner's recipes + likes fill the feed...
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  // ...but the cold-view no longer renders the members list (it lives on Account).
  await expect(page.getByTestId('cookbook-member')).toHaveCount(0);
  await expect(page.getByTestId('cookbook-members')).toHaveCount(0);
});

test('taste preference: a "never" cuisine hides matching recipes in the cookbook feed', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'taste-preference',
      JSON.stringify({ only: { cuisine: [], category: [] }, never: { cuisine: ['greek'], category: [] } }),
    );
  });
  await routeCookbookFixtures(page);
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  // The mixed feed has two Greek recipes; the standing "Never: Greek" hides them.
  await expect(page.getByText('Greek Salad')).toHaveCount(0);
  await expect(page.getByText('Greek Vegan Lunch Bowl')).toHaveCount(0);
  await expect(page.getByText('Italian Minestrone')).toBeVisible();
  // A standing preference redefines the eligible pool: the plain count is 2 —
  // never "2 of 4", which would read as eligible recipes withheld.
  await expect(page.getByTestId('recipes-status')).toHaveText('2 recipes');
  // And the facet dropdowns offer only the eligible pool — no dead "greek" option.
  await page.getByTestId('filters-dd').locator('summary').click();
  await expect(page.locator('input[data-dimension=cuisine][data-value=greek]')).toHaveCount(0);
  await expect(page.locator('input[data-dimension=cuisine][data-value=italian]')).toHaveCount(1);
});

test('cookbook cold-view has the shared toolbar driving the feed (Phase 8 wiring)', async ({
  page,
}) => {
  await routeCookbookFixtures(page);
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  // The shared toolbar renders over the cookbook feed.
  await expect(page.getByTestId('view-tiles')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('view-details')).toBeVisible();
  await expect(page.getByTestId('recipes-status')).toBeVisible();
  // Cookbook opens on Details (rows) — the reading-oriented default (unlike
  // Browse's tiles-first). The feed paints as .recipe-rows.
  await expect(page.locator('[data-testid="cookbook-feed"] .recipe-rows')).toBeVisible();
  const count = await page.getByTestId('recipe-item').count();
  expect(count).toBeGreaterThan(0);

  // Toggle Tiles → the feed re-renders as a grid (both directions asserted).
  await page.getByTestId('view-tiles').click();
  await expect(page.locator('[data-testid="cookbook-feed"] .recipe-grid')).toBeVisible();
  await expect(page.locator('[data-testid="cookbook-feed"] .recipe-rows')).toHaveCount(0);
  // Back to Details.
  await page.getByTestId('view-details').click();
  await expect(page.locator('[data-testid="cookbook-feed"] .recipe-rows')).toBeVisible();
  await expect(page.locator('[data-testid="cookbook-feed"] .recipe-grid')).toHaveCount(0);
});

test('cold-view shows a content-freshness note and paints from cache while the revalidate stalls (SWR)', async ({
  page,
}) => {
  // First visit populates the persisted author meta (localStorage) + the recipe
  // cache (IndexedDB), and shows the freshness note.
  await routeCookbookFixtures(page);
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('cookbook-freshness')).toContainText('as of', { timeout: 15_000 });
  const persisted = await page.evaluate(
    (did) => localStorage.getItem(`cookbook-feed:${did}`),
    VIEWED.did,
  );
  // The owner (author set) AND their liked uris persist for the next paint —
  // liked recipes live on other authors' DIDs, so the uris are what lets the
  // instant paint cover the whole shared set.
  expect(persisted).toContain(VIEWED.did);
  expect(persisted).toContain('likedUris');
  expect(persisted).toContain(FOLLOW.did); // via the liked recipe uris

  // Second visit: keep plc.directory (DID resolve) working, but STALL the feed
  // sources so the background revalidate never completes. The cache-first paint
  // must still render the feed from IndexedDB — no stall waiting on the network —
  // and it covers the COMPLETE shared set (own + liked), not just the owner's.
  for (const pds of Object.values(pdsByDid)) await page.route(`${pds}/**`, () => {}); // hang
  await page.route('https://public.api.bsky.app/**', () => {}); // hang
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  await expect(page.getByTestId('recipe-item')).toHaveCount(4, { timeout: 10_000 });
  await expect(page.getByTestId('cookbook-freshness')).toContainText('as of');
});

// The shared-scope decision (owner, 2026-07-16): shared = EXACTLY the owner's
// cookbook — their recipes + their likes — not their follow reach. VIEWED
// follows FOLLOW (graph routed), yet FOLLOW's un-liked recipe must stay out.
test('the shared view is exactly the owner’s recipes + their likes — never their follows’ feed', async ({
  page,
}) => {
  await routeCookbookFixtures(page);
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  await expect(page.getByTestId('recipe-item')).toHaveCount(4, { timeout: 15_000 });
  // Their own two…
  await expect(page.getByText('Greek Salad')).toBeVisible();
  await expect(page.getByText('American Pancakes')).toBeVisible();
  // …plus the two they liked (loaded via their interaction records)…
  await expect(page.getByText('Italian Minestrone')).toBeVisible();
  await expect(page.getByText('Greek Vegan Lunch Bowl')).toBeVisible();
  // …and NOT the follow's un-liked recipe, even though VIEWED follows them.
  await expect(page.getByText('Follow-Only Dish')).toHaveCount(0);
  await expect(page.getByTestId('recipes-status')).toHaveText('4 recipes');
  // Liked entries carry their real author's handle (resolved with the ref),
  // not a raw-DID fallback — observable on the row link's `by=` param.
  const likedRow = page.getByTestId('recipe-item').filter({ hasText: 'Italian Minestrone' });
  await expect(likedRow).toHaveAttribute('href', /by=follow\.example\.com/);
});

test('cold-view: text search filters the cookbook feed (ingredient reach)', async ({ page }) => {
  await routeCookbookFixtures(page);
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);

  // "feta" reaches Greek Salad's ingredients (not its title) — the same shared
  // search input drives the cookbook feed.
  await page.getByTestId('recipe-search').fill('feta');
  await expect(page.getByTestId('recipe-item')).toHaveCount(1);
  await expect(page.getByText('Greek Salad')).toBeVisible();
  await expect(page.getByTestId('recipes-status')).toContainText('1 of 4 recipes');

  // Reset-surface v2: with a query active the reset shows in the count block —
  // no popover needed — and restores the full feed while clearing the box.
  await expect(page.getByTestId('filters-dd')).toHaveJSProperty('open', false);
  await expect(page.getByTestId('reset-filters')).toBeVisible();
  await page.getByTestId('reset-filters').click();
  await expect(page.getByTestId('recipe-item')).toHaveCount(4);
  await expect(page.getByTestId('recipe-search')).toHaveValue('');
});

// D7 mobile: the cold-view Cookbook keeps its toolbar within three control rows
// at a phone width (the source row is present on the signed-in own cookbook; the
// cold-view has none, so this bounds ≤3), with no horizontal overflow.
test('mobile (390px): cold-view Cookbook stays within three toolbar rows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await routeCookbookFixtures(page);
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  const rows = await page.locator('.browse-toolbar .toolbar-row:visible').count();
  expect(rows).toBeLessThanOrEqual(3);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'no horizontal overflow @390px').toBeLessThanOrEqual(1);
});

// Shared-cookbook view (owner feedback 2026-07-16): opening someone else's
// cookbook (?did=) labels the page with a banner under the site banner —
// "Viewing <handle>'s shared cookbook", the handle linked to their Bluesky
// profile — replacing the old bare "Cookbook of <did>" status line.
test('cold-view shows the shared-cookbook banner with the owner handle linked to their Bluesky profile', async ({
  page,
}) => {
  await routeCookbookFixtures(page);
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  const banner = page.getByTestId('shared-cookbook-banner');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText(/shared cookbook/);
  await expect(banner).toContainText(/^Viewing /);
  // The user paints as the DID first and upgrades to the resolved handle.
  const user = page.getByTestId('shared-cookbook-user');
  await expect(user).toHaveText('viewed.example.com', { timeout: 15_000 });
  await expect(user).toHaveAttribute('href', 'https://bsky.app/profile/viewed.example.com');
  // The old bare status line is gone (the banner replaces it).
  await expect(page.locator('.panel', { hasText: 'Cookbook of did:' })).toHaveCount(0);
  // Anonymous visitor: no ✕ — there is no own cookbook to return to.
  await expect(page.getByTestId('shared-cookbook-close')).toHaveCount(0);
});

test('the shared-cookbook banner shows a ✕ back to your own cookbook when signed in (session hint)', async ({
  page,
}) => {
  await routeCookbookFixtures(page);
  // The zero-auth session hint marks "signed in" for shell affordances; the
  // ?did= cold-view renders before any auth boot, so the hint alone drives the ✕.
  await page.addInitScript(() => window.localStorage.setItem('arecipe-session', '1'));
  await page.goto(`/cookbook.html?did=${encodeURIComponent(VIEWED.did)}`);
  const close = page.getByTestId('shared-cookbook-close');
  await expect(close).toBeVisible({ timeout: 15_000 });
  // Same page path: closing IS navigating back to your own cookbook in place.
  await expect(close).toHaveAttribute('href', /cookbook\.html$/);
  await expect(close).toHaveAttribute('aria-label', /your cookbook/i);
});

test('legacy friends.html redirects to cookbook.html (query preserved)', async ({ page }) => {
  await page.goto(`/friends.html?did=${encodeURIComponent(VIEWED.did)}`);
  await expect(page).toHaveURL(new RegExp(`/cookbook\\.html\\?did=`), { timeout: 15_000 });
});
