// D3/D4: warm-session revalidation. The headline (acceptance #3): a warm session
// with nothing changed upstream makes ONE getLatestCommit per cook and fetches
// NO records. Then: a changed cook triggers exactly one refetch and updates in
// place; a deactivated cook (400) disappears. Fixtures cover ALL four
// STARTER_AUTHORS so there are no uncovered cooks falling through to the live
// path. The snapshot files + PDS responses are routed (dist ships an empty
// skeleton in this env).
import { expect, test, type Page, type Route } from '@playwright/test';

// All four STARTER_AUTHORS (src/recipes/starter.ts), each on its own fake PDS.
const COOKS = [
  { did: 'did:plc:spfl4xaktvvchr2cqp2r2xvp', handle: 'arecipe.bsky.social', pds: 'https://pds0.test', rev: 'r0', rkey: 'k0', title: 'Snap 0' },
  { did: 'did:plc:26tsx5juuss4yealylyfbj4h', handle: 'rdur.dev', pds: 'https://pds1.test', rev: 'r1', rkey: 'k1', title: 'Snap 1' },
  { did: 'did:plc:4cx7ts7lqgjtsfquo53qo3sz', handle: 'recipe.exchange', pds: 'https://pds2.test', rev: 'r2', rkey: 'k2', title: 'Snap 2' },
  { did: 'did:plc:vspq46f5zmrlesaszlyfliy2', handle: 'daffl.xyz', pds: 'https://pds3.test', rev: 'r3', rkey: 'k3', title: 'Snap 3' },
];
const CHANGED = COOKS[1]!; // rdur.dev moves

const recipe = (did: string, rkey: string, name: string) => ({
  uri: `at://${did}/exchange.recipe.recipe/${rkey}`,
  cid: `bafyreih${rkey}`,
  value: { name, text: `${name} description`, ingredients: ['x'], instructions: ['y'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
});

const INDEX = { buildId: 'test', cooks: COOKS.map((c) => ({ did: c.did, handle: c.handle, displayName: c.handle, recipes: [{ rkey: c.rkey, title: c.title }] })) };
const MANIFEST = {
  buildId: 'test',
  capturedAt: '2026-07-23T00:00:00Z',
  omitted: [],
  cooks: COOKS.map((c) => ({ did: c.did, handle: c.handle, displayName: c.handle, pds: c.pds, rev: c.rev, cid: `commit-${c.rev}`, recordCount: 1, sha256: 'x', capturedAt: 'x', shards: [{ file: `cooks/${c.did}.json`, sha256: 'x', recordCount: 1 }] })),
};
const SHARDS: Record<string, unknown> = Object.fromEntries(
  COOKS.map((c) => [c.did, { did: c.did, handle: c.handle, rev: c.rev, cid: `commit-${c.rev}`, part: 0, records: [recipe(c.did, c.rkey, c.title)] }]),
);
const didFromCommit = (url: string): string => decodeURIComponent(new URL(url).searchParams.get('did') ?? '');
const revOf = (did: string): string => COOKS.find((c) => c.did === did)?.rev ?? 'r?';

const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const routeSnapshot = async (page: Page): Promise<void> => {
  await page.route('**/assets/snapshot/**/index.json', (r) => json(r, INDEX));
  await page.route('**/assets/snapshot/**/manifest.json', (r) => json(r, MANIFEST));
  await page.route('**/assets/snapshot/**/cooks/*.json', (r) => {
    const did = decodeURIComponent(r.request().url().split('/').pop() ?? '').replace('.json', '');
    return SHARDS[did] === undefined ? r.fulfill({ status: 404, body: '{}' }) : json(r, SHARDS[did]);
  });
};

test('warm session, nothing changed: one getLatestCommit per cook, zero record fetches', async ({ page }) => {
  const reqs: string[] = [];
  page.on('request', (r) => reqs.push(r.url()));
  await routeSnapshot(page);
  await page.route('**/xrpc/com.atproto.sync.getLatestCommit**', (r) => json(r, { rev: revOf(didFromCommit(r.request().url())), cid: 'c' }));
  await page.route('**/xrpc/com.atproto.repo.listRecords**', (r) => json(r, { records: [] }));
  await page.route('https://plc.directory/**', (r) => r.fulfill({ status: 500, body: '{}' }));

  await page.goto('/');
  await expect(page.getByTestId('recipe-item')).toHaveCount(4, { timeout: 15_000 });
  await expect.poll(() => reqs.filter((u) => u.includes('getLatestCommit')).length, { timeout: 10_000 }).toBe(4);
  await page.waitForTimeout(500);
  expect(reqs.filter((u) => u.includes('listRecords')).length).toBe(0); // nothing changed → no record fetches
  expect(reqs.filter((u) => u.includes('getLatestCommit')).length).toBe(4);
});

test('one changed cook triggers exactly one refetch and updates in place', async ({ page }) => {
  const reqs: string[] = [];
  page.on('request', (r) => reqs.push(r.url()));
  await routeSnapshot(page);
  await page.route('**/xrpc/com.atproto.sync.getLatestCommit**', (r) => {
    const did = didFromCommit(r.request().url());
    return json(r, { rev: did === CHANGED.did ? 'MOVED' : revOf(did), cid: 'c' });
  });
  // Catch-all first, specific last — Playwright runs the last-registered match
  // first, so the changed cook's fresh records win over the empty default.
  await page.route('**/xrpc/com.atproto.repo.listRecords**', (r) => json(r, { records: [] }));
  await page.route(`${CHANGED.pds}/xrpc/com.atproto.repo.listRecords**`, (r) => json(r, { records: [recipe(CHANGED.did, CHANGED.rkey, 'FRESH 1')] }));
  await page.route('https://plc.directory/**', (r) => json(r, { id: CHANGED.did, alsoKnownAs: [`at://${CHANGED.handle}`], service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: CHANGED.pds }] }));

  await page.goto('/');
  await expect(page.getByText('Snap 1')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('FRESH 1')).toBeVisible({ timeout: 10_000 }); // live wins in place
  await expect(page.getByText('Snap 1')).toHaveCount(0);
  expect(reqs.filter((u) => u.includes('listRecords')).length).toBe(1); // only the changed cook
});

test('a deactivated cook (400) disappears from the live view', async ({ page }) => {
  await routeSnapshot(page);
  await page.route('**/xrpc/com.atproto.sync.getLatestCommit**', (r) => {
    const did = didFromCommit(r.request().url());
    return did === CHANGED.did ? r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'RepoDeactivated' }) }) : json(r, { rev: revOf(did), cid: 'c' });
  });
  await page.route('**/xrpc/com.atproto.repo.listRecords**', (r) => json(r, { records: [] }));

  await page.goto('/');
  await expect(page.getByText('Snap 0')).toBeVisible({ timeout: 15_000 }); // an unaffected cook paints
  await expect(page.getByText('Snap 1')).toHaveCount(0, { timeout: 10_000 }); // deactivated cook removed
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
});
