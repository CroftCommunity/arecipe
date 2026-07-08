// Phase 9b wiring (@live half): the comment WRITE path against the real test
// account PDS. Sign in, comment on a real recipe, see it appear, reply to it,
// see the reply nest. Guarded by a whole-collection purge of app.arecipe.comment
// on the test account (hard-scoped to TEST_DID), pre-run + teardown. Runs only
// with BSKY_TEST_* creds in .env (never in push CI).
import { expect, test } from '@playwright/test';
import { purgeCollection, readEnv, signIn, TEST_DID } from './helpers/live.js';
import { COMMENT_COLLECTION } from '../../src/social/comments.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';
const APP_PASSWORD = env['BSKY_TEST_APP_PASSWORD'] ?? '';

// A real, public recipe (rdur.dev — a starter author). The test account is in
// the recipe page's discovery set (self), so its comment shows on reload.
const RECIPE_URI =
  'at://did:plc:26tsx5juuss4yealylyfbj4h/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D';

const COMMENT_TEXT = 'e2e top-level comment';
const REPLY_TEXT = 'e2e nested reply';

const purgeComments = (): Promise<void> =>
  purgeCollection(COMMENT_COLLECTION, { handle: HANDLE, appPassword: APP_PASSWORD });

test('@live comment → appears → reply nests (the comment write path)', async ({ page, baseURL }) => {
  test.skip(
    HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '',
    'needs BSKY_TEST_* credentials in .env',
  );
  test.setTimeout(180_000);
  await purgeComments(); // crash-safe pre-run

  await signIn(page, {
    handle: HANDLE,
    password: PASSWORD,
    origin: baseURL ?? 'http://127.0.0.1:4173',
  });
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

  await page.goto(`/recipe.html?u=${encodeURIComponent(RECIPE_URI)}`);
  await expect(page.getByTestId('comment-compose')).toBeVisible({ timeout: 30_000 });

  // Post a top-level comment.
  await page.getByTestId('comment-text').fill(COMMENT_TEXT);
  await page.getByTestId('comment-post').click();
  const rootComment = page.getByTestId('comment-item').filter({ hasText: COMMENT_TEXT });
  await expect(rootComment.first()).toBeVisible({ timeout: 30_000 });

  // Reply to it → the reply nests inside the root comment.
  await rootComment.first().getByTestId('comment-reply').first().click();
  await expect(page.getByTestId('comment-replying')).toBeVisible();
  await page.getByTestId('comment-text').fill(REPLY_TEXT);
  await page.getByTestId('comment-post').click();
  await expect(
    page.getByTestId('comment-item').filter({ hasText: COMMENT_TEXT }).first().getByTestId('comment-item'),
  ).toContainText(REPLY_TEXT, { timeout: 30_000 });

  // The records are really on the test account's PDS.
  const listUrl = `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${TEST_DID}&collection=${COMMENT_COLLECTION}&limit=10`;
  const after = (await (await fetch(listUrl)).json()) as { records?: unknown[] };
  expect((after.records ?? []).length).toBe(2);

  await purgeComments(); // teardown
});
