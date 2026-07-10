// Phase 8 wiring (@live): eviction survival + versioning against the REAL
// PDS. One journey: draft syncs to the account → local storage wiped
// (simulated eviction) → draft recovered from the PDS → published → edited
// (putRecord, same rkey, new CID) → the stale cache notices and refreshes.
// Cleanup is HARD-GUARDED to the test account (marker names, both
// collections, pre-run purge + teardown).
import { expect, test } from '@playwright/test';
import { readEnv, signIn } from './helpers/live.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';
const APP_PASSWORD = env['BSKY_TEST_APP_PASSWORD'] ?? '';

const TEST_DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';
const MARKER = 'arecipe e2e';

type Session = { did: string; accessJwt: string };
const login = async (): Promise<Session> => {
  const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: HANDLE, password: APP_PASSWORD }),
  });
  const session = (await res.json()) as Session & { error?: string };
  if (session.error !== undefined) throw new Error(`cleanup login failed: ${session.error}`);
  if (session.did !== TEST_DID) {
    throw new Error(`SAFETY: cleanup session is ${session.did}, expected the test account`);
  }
  return session;
};

const purge = async (collection: string, isTestRecord: (v: Record<string, unknown>) => boolean) => {
  const session = await login();
  const list = (await (
    await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${TEST_DID}&collection=${collection}&limit=100`,
      { headers: { authorization: `Bearer ${session.accessJwt}` } },
    )
  ).json()) as { records?: { uri: string; value: Record<string, unknown> }[] };
  for (const record of list.records ?? []) {
    if (!isTestRecord(record.value)) continue;
    const rkey = record.uri.split('/').pop() ?? '';
    await fetch('https://bsky.social/xrpc/com.atproto.repo.deleteRecord', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessJwt}` },
      body: JSON.stringify({ repo: TEST_DID, collection, rkey }),
    });
  }
};

const purgeAll = async (): Promise<void> => {
  await purge('exchange.recipe.recipe', (v) => String(v['name'] ?? '').includes(MARKER));
  await purge('app.arecipe.draft', (v) =>
    String((v['fields'] as { name?: string } | undefined)?.name ?? '').includes(MARKER),
  );
};

test('@live drafts survive eviction; edits version; stale caches refresh', async ({
  browser,
  page,
  baseURL,
}) => {
  test.skip(
    HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '',
    'needs BSKY_TEST_* credentials in .env',
  );
  test.setTimeout(300_000);
  await purgeAll();
  const origin = baseURL ?? 'http://127.0.0.1:4173';
  const name = `Eviction Survivor (${MARKER})`;

  await signIn(page, { handle: HANDLE, password: PASSWORD, origin });
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

  // Draft, synced to the account (disclosure visible). New recipe lives on
  // Alchemy (signIn lands on Account now).
  await page.goto('/mine.html');
  await page.getByTestId('new-recipe').click();
  await expect(page.getByTestId('draft-disclosure')).toContainText('publicly readable');
  await page.getByTestId('editor-name').fill(name);
  await page.getByTestId('editor-text').fill('Written to survive.');
  await page.getByTestId('editor-ingredients').fill('resolve');
  await page.getByTestId('editor-instructions').fill('Persist.');
  await page.getByTestId('save-draft').click();
  await expect(page.getByTestId('editor-status')).toContainText('backed up to your account', {
    timeout: 30_000,
  });

  // Simulated eviction: wipe the local draft store, then visit Alchemy —
  // the draft must come back from the PDS.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('arecipe-drafts');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      }),
  );
  await page.goto('/mine.html');
  const recovered = page.getByTestId('draft-row').filter({ hasText: name });
  await expect(recovered).toHaveCount(1, { timeout: 30_000 });

  // Publish it (v1).
  await recovered.locator('a').click();
  await expect(page.getByTestId('editor-name')).toHaveValue(name, { timeout: 15_000 });
  await page.getByTestId('publish').click();
  await expect(page).toHaveURL(/mine\.html/, { timeout: 60_000 });

  // The published recipe now lists on Cookbook → "Mine" (Alchemy's Published
  // list was retired).
  await page.goto('/cookbook.html');
  await page.getByTestId('source-mine').click();
  const card = page.getByTestId('recipe-item').filter({ hasText: name });
  await expect(card).toHaveCount(1, { timeout: 30_000 });

  // Device B (independent context, public read): views v1 — its cache pins
  // the v1 CID. This is the reader whose cache will go stale.
  const recipeUrl = (await card.getAttribute('href')) ?? '';
  const deviceB = await browser.newContext({ baseURL: origin });
  const pageB = await deviceB.newPage();
  await pageB.goto(recipeUrl);
  await expect(pageB.locator('h2')).toContainText(name, { timeout: 30_000 });

  // Device A edits from the recipe page itself: as the author, the recipe page
  // offers an Edit link (→ editor.html?edit=). Same rkey → new CID.
  await page.goto(recipeUrl);
  await expect(page.getByTestId('edit-recipe')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('edit-recipe').click();
  await expect(page.locator('.page-title')).toHaveText('Edit recipe', { timeout: 15_000 });
  await expect(page.getByTestId('editor-name')).toHaveValue(name, { timeout: 15_000 });
  await page.getByTestId('editor-text').fill('Written to survive. Now revised.');
  await page.getByTestId('publish').click();
  await expect(page).toHaveURL(/mine\.html/, { timeout: 60_000 });

  // Device B revisits: cache serves v1, the background check notices v2.
  await pageB.reload();
  await expect(pageB.getByTestId('stale-indicator')).toBeVisible({ timeout: 30_000 });
  await pageB.getByTestId('refresh-recipe').click();
  await expect(pageB.locator('.lede')).toContainText('Now revised.');
  await deviceB.close();

  await purgeAll();
});
