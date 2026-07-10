// Phase 6 wiring (@live half): the write path — author in the editor,
// Publish to the REAL test-account PDS, record appears in Alchemy.
// Crash-safe cleanup per the plan: a per-run marker in the recipe name +
// pre-run purge of prior test recipes + teardown delete, all HARD-GUARDED
// to the dedicated test account's DID. Never runs against any other repo.
import { expect, test } from '@playwright/test';
import { readEnv, signIn } from './helpers/live.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';
const APP_PASSWORD = env['BSKY_TEST_APP_PASSWORD'] ?? '';

/** The ONLY repo this suite may write to or purge. */
const TEST_DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';
const COLLECTION = 'exchange.recipe.recipe';
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

/** Delete every MARKER-named test recipe in the TEST repo (guarded). */
const purgeTestRecipes = async (): Promise<void> => {
  const session = await login();
  const list = (await (
    await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${TEST_DID}&collection=${COLLECTION}&limit=100`,
      { headers: { authorization: `Bearer ${session.accessJwt}` } },
    )
  ).json()) as { records?: { uri: string; value: { name?: string } }[] };
  for (const record of list.records ?? []) {
    if (record.value.name?.includes(MARKER) !== true) continue; // never touch non-test records
    const rkey = record.uri.split('/').pop() ?? '';
    await fetch('https://bsky.social/xrpc/com.atproto.repo.deleteRecord', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify({ repo: TEST_DID, collection: COLLECTION, rkey }),
    });
  }
};

test('@live author → publish → appears in Alchemy (the write path)', async ({
  page,
  baseURL,
}) => {
  test.skip(
    HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '',
    'needs BSKY_TEST_* credentials in .env',
  );
  test.setTimeout(180_000);
  await purgeTestRecipes(); // crash-safe: clear any prior run's leftovers

  await signIn(page, {
    handle: HANDLE,
    password: PASSWORD,
    origin: baseURL ?? 'http://127.0.0.1:4173',
  });
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

  // New recipe lives on Alchemy (signIn lands on Account now).
  await page.goto('/mine.html');
  await page.getByTestId('new-recipe').click();
  await expect(page).toHaveURL(/editor\.html/);
  const name = `Midnight Toast (${MARKER})`;
  await page.getByTestId('editor-name').fill(name);
  await page.getByTestId('editor-text').fill('Toast, but at midnight. Published by the e2e suite.');
  await page.getByTestId('editor-ingredients').fill('2 slices bread\nbutter');
  await page.getByTestId('editor-instructions').fill('Toast the bread.\nButter it generously.');

  // Photo (Phase 7): attach the EXIF-bearing fixture — the re-encode must
  // strip the metadata before the bytes ever leave the device.
  await page
    .getByTestId('editor-photo')
    .setInputFiles(new URL('../fixtures/images/exif-test.jpg', import.meta.url).pathname);
  await expect(page.getByTestId('photo-status')).toContainText('metadata removed');

  await page.getByTestId('publish').click();

  // Publish lands back on Alchemy (the editor redirects there).
  await expect(page).toHaveURL(/mine\.html/, { timeout: 60_000 });
  // The published record now surfaces on Cookbook → "Mine" (the Alchemy
  // Published list was retired — one home for your published recipes).
  await page.goto('/cookbook.html');
  await page.getByTestId('source-mine').click();
  await expect(page.getByTestId('recipe-item').filter({ hasText: name })).toHaveCount(1, {
    timeout: 30_000,
  });

  // The published record carries the embed; the blob is publicly fetchable
  // and contains NO Exif marker (the GPS-stripping claim, verified on the
  // actual uploaded bytes).
  const session = await login();
  const list = (await (
    await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${TEST_DID}&collection=${COLLECTION}&limit=10`,
      { headers: { authorization: `Bearer ${session.accessJwt}` } },
    )
  ).json()) as {
    records: { value: { name?: string; embed?: { images?: { image?: { ref?: { $link?: string } }; aspectRatio?: unknown }[] } } }[];
  };
  const published = list.records.find((r) => r.value.name === name);
  const image = published?.value.embed?.images?.[0];
  expect(image?.aspectRatio).toBeDefined();
  const cid = image?.image?.ref?.$link;
  expect(cid).toBeDefined();
  const blobRes = await fetch(
    `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${TEST_DID}&cid=${cid}`,
  );
  expect(blobRes.status).toBe(200);
  const bytes = Buffer.from(await blobRes.arrayBuffer());
  expect(bytes.subarray(0, 2_048).includes('Exif')).toBe(false);

  await purgeTestRecipes(); // teardown (best-effort; pre-run purge covers crashes)
});
