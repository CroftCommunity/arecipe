// Phase 9c wiring (@live half): the like WRITE path against the real test
// account PDS. Sign in, open a real recipe, like it → count reflects + heart
// active, unlike → count drops. Guarded by a whole-collection purge of
// app.arecipe.interaction on the test account (hard-scoped to TEST_DID).
import { expect, test } from '@playwright/test';
import { purgeCollection, readEnv, signIn, TEST_DID } from './helpers/live.js';
import { INTERACTION_COLLECTION } from '../../src/social/interactions.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';
const APP_PASSWORD = env['BSKY_TEST_APP_PASSWORD'] ?? '';

const RECIPE_URI =
  'at://did:plc:26tsx5juuss4yealylyfbj4h/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D';

const purgeInteractions = (): Promise<void> =>
  purgeCollection(INTERACTION_COLLECTION, { handle: HANDLE, appPassword: APP_PASSWORD });

test('@live like → count reflects → unlike (the like write path)', async ({ page, baseURL }) => {
  test.skip(
    HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '',
    'needs BSKY_TEST_* credentials in .env',
  );
  test.setTimeout(180_000);
  await purgeInteractions(); // crash-safe pre-run

  await signIn(page, {
    handle: HANDLE,
    password: PASSWORD,
    origin: baseURL ?? 'http://127.0.0.1:4173',
  });
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}`);
  const likeBtn = page.getByTestId('like-button');
  await expect(likeBtn).toBeEnabled({ timeout: 30_000 });

  // Like → count reflects the test account's like + heart goes active.
  await likeBtn.click();
  await expect(page.getByTestId('like-count')).toHaveText('1 like', { timeout: 30_000 });
  await expect(likeBtn).toHaveText(/Liked/);

  // The record is really on the PDS.
  const listUrl = `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${TEST_DID}&collection=${INTERACTION_COLLECTION}&limit=10`;
  const after = (await (await fetch(listUrl)).json()) as { records?: unknown[] };
  expect((after.records ?? []).length).toBe(1);

  // Unlike → count drops and the record is gone.
  await likeBtn.click();
  await expect(page.getByTestId('like-count')).toHaveText('0 likes', { timeout: 30_000 });
  const gone = (await (await fetch(listUrl)).json()) as { records?: unknown[] };
  expect((gone.records ?? []).length).toBe(0);

  await purgeInteractions(); // teardown
});
