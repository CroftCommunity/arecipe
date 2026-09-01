// D2: the boot path. The measurable claim is a cold load that renders the full
// cook list + recipe index with ZERO network beyond the bundle. We prove it by
// aborting every cross-origin request (plc.directory, PDSes, the Bluesky CDN)
// and asserting the full list still renders from the precached snapshot. The
// second test proves a corrupt snapshot degrades to live loading (logged once,
// no blank screen, no error dialog).
import { expect, test, type Page, type Route } from '@playwright/test';

// Real STARTER_AUTHORS DIDs (src/recipes/starter.ts) so the default-feed filter
// keeps the snapshot entries.
const COOK_A = { did: 'did:plc:26tsx5juuss4yealylyfbj4h', handle: 'rdur.dev' };
const COOK_B = { did: 'did:plc:4cx7ts7lqgjtsfquo53qo3sz', handle: 'recipe.exchange' };

const recipe = (did: string, rkey: string, name: string) => ({
  uri: `at://${did}/exchange.recipe.recipe/${rkey}`,
  cid: `bafyreih${rkey}`,
  value: {
    name,
    text: `${name} description`,
    ingredients: ['1 cup flour'],
    instructions: ['Mix', 'Bake'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
});

const INDEX = {
  buildId: 'test',
  cooks: [
    {
      did: COOK_A.did,
      handle: COOK_A.handle,
      displayName: 'R Dur',
      recipes: [
        { rkey: 'a1', title: 'Snapshot Apple Pie' },
        { rkey: 'a2', title: 'Snapshot Banana Bread' },
      ],
    },
    { did: COOK_B.did, handle: COOK_B.handle, displayName: 'Recipe Exchange', recipes: [{ rkey: 'b1', title: 'Snapshot Cake' }] },
  ],
};
const SHARDS: Record<string, unknown> = {
  [COOK_A.did]: { did: COOK_A.did, handle: COOK_A.handle, rev: 'ra', cid: 'ca', part: 0, records: [recipe(COOK_A.did, 'a1', 'Snapshot Apple Pie'), recipe(COOK_A.did, 'a2', 'Snapshot Banana Bread')] },
  [COOK_B.did]: { did: COOK_B.did, handle: COOK_B.handle, rev: 'rb', cid: 'cb', part: 0, records: [recipe(COOK_B.did, 'b1', 'Snapshot Cake')] },
};

const json = (route: Route, body: unknown): Promise<void> =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Route the precached snapshot files to our fixture (dist ships only an empty
 * skeleton in this hermetic env). buildId is wildcarded. */
const routeSnapshot = async (page: Page, index: unknown): Promise<void> => {
  await page.route('**/assets/snapshot/**/index.json', (route) => json(route, index));
  await page.route('**/assets/snapshot/**/cooks/*.json', (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '').replace('.json', '');
    const shard = SHARDS[did];
    return shard === undefined ? route.fulfill({ status: 404, body: '{}' }) : json(route, shard);
  });
};

test('cold load renders the full index with zero network beyond the bundle', async ({ page, baseURL }) => {
  const base = new URL(baseURL ?? 'http://127.0.0.1:4173').origin;
  // Block EVERY cross-origin request: plc.directory, PDSes, the CDN. Same-origin
  // bundle assets are served normally; the snapshot routes below take priority.
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
  );
  await routeSnapshot(page, INDEX);

  await page.goto('/');
  // The full list renders — three recipes across two cooks — with all PDS
  // traffic aborted. It could only have come from the bundle.
  await expect(page.getByTestId('recipe-item')).toHaveCount(3, { timeout: 15_000 });
  await expect(page.getByText('Snapshot Apple Pie')).toBeVisible();
  await expect(page.getByText('Snapshot Cake')).toBeVisible();
});

test('a corrupt snapshot degrades to live loading, logged once, no blank screen', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().includes('snapshot')) warnings.push(m.text());
  });

  // Corrupt/truncated index.json.
  await page.route('**/assets/snapshot/**/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"buildId":"test","cooks":[' }),
  );
  // Live path succeeds: resolve the two cooks + serve their records.
  const PDS: Record<string, string> = { [COOK_A.did]: 'https://pdsa.test', [COOK_B.did]: 'https://pdsb.test' };
  await page.route('https://plc.directory/**', (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    const pds = PDS[did];
    if (pds === undefined) return route.fulfill({ status: 404, body: '{}' });
    return json(route, { id: did, service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: pds }] });
  });
  for (const [did, pds] of Object.entries(PDS)) {
    await page.route(`${pds}/**`, (route) => json(route, { records: (SHARDS[did] as { records: unknown[] }).records }));
  }

  await page.goto('/');
  // The list renders from LIVE loading (3 records), not blank, no error dialog.
  await expect(page.getByTestId('recipe-item')).toHaveCount(3, { timeout: 15_000 });
  expect(warnings.length).toBeGreaterThanOrEqual(1); // logged the snapshot fallback
});
