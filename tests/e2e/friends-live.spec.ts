// Phase 9a wiring (@live half): the friends WRITE path against the real test
// account PDS. Add a real friend by handle → their recipes appear in the feed
// → remove → the record is gone. Guarded by a whole-collection purge of
// app.arecipe.friend on the test account (hard-scoped to TEST_DID), crash-safe
// pre-run + teardown. Runs only with BSKY_TEST_* creds in .env (never in push CI).
import { expect, test } from '@playwright/test';
import { purgeCollection, readEnv, signIn, TEST_DID } from './helpers/live.js';
import { FRIEND_COLLECTION } from '../../src/social/friends.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';
const APP_PASSWORD = env['BSKY_TEST_APP_PASSWORD'] ?? '';

// A real, resolvable friend with public recipes (a starter author).
const FRIEND_HANDLE = 'rdur.dev';

const purgeFriends = (): Promise<void> =>
  purgeCollection(FRIEND_COLLECTION, { handle: HANDLE, appPassword: APP_PASSWORD });

test('@live add friend → their recipes appear → remove (the friends write path)', async ({
  page,
  baseURL,
}) => {
  test.skip(
    HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '',
    'needs BSKY_TEST_* credentials in .env',
  );
  test.setTimeout(180_000);
  await purgeFriends(); // crash-safe: clear any prior run's leftovers

  await signIn(page, {
    handle: HANDLE,
    password: PASSWORD,
    origin: baseURL ?? 'http://127.0.0.1:4173',
  });
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

  await page.goto('/friends.html');
  await expect(page.getByTestId('friend-add')).toBeVisible({ timeout: 30_000 });

  // Add a real friend by handle.
  await page.getByTestId('friend-handle-input').fill(FRIEND_HANDLE);
  await page.getByTestId('friend-add').click();
  await expect(page.getByTestId('friends-status')).toContainText(`added ${FRIEND_HANDLE}`, {
    timeout: 30_000,
  });

  // The friend row appears, and their public recipes fill the feed.
  await expect(
    page.getByTestId('friend-row').filter({ hasText: FRIEND_HANDLE }),
  ).toHaveCount(1);
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 30_000 });

  // The record is really on the test account's PDS.
  const listUrl = `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${TEST_DID}&collection=${FRIEND_COLLECTION}&limit=10`;
  const before = (await (await fetch(listUrl)).json()) as { records?: unknown[] };
  expect((before.records ?? []).length).toBeGreaterThanOrEqual(1);

  // Remove → the row leaves and the record is gone.
  await page.getByTestId('friend-row').filter({ hasText: FRIEND_HANDLE }).getByTestId('friend-remove').click();
  await expect(page.getByTestId('friend-row').filter({ hasText: FRIEND_HANDLE })).toHaveCount(0, {
    timeout: 30_000,
  });
  const after = (await (await fetch(listUrl)).json()) as { records?: unknown[] };
  expect((after.records ?? []).length).toBe(0);

  await purgeFriends(); // teardown (best-effort; pre-run purge covers crashes)
});
