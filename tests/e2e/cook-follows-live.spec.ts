// Cook follows — the signed-in round-trip against the real PDS (@live, D5).
// Clears the cook-follows run's recorded assumption ("a novel app.arecipe.*
// collection behaves like app.arecipe.mealPlan on a live PDS") with evidence:
// sign in → follow a cook through the Account add panel → the account's own
// public listRecords shows exactly one app.arecipe.cookFollow record with that
// subject → unfollow through the per-row control → listRecords shows none.
//
// The write path is the real one (createRecord/deleteRecord via the session
// Agent through cookbook-members-view); the read path is the same public,
// unauthenticated listRecords the app itself uses. Everything this spec creates
// it deletes — a whole-collection purge (hard-scoped to TEST_DID) runs before
// AND after, so a crash mid-run can't leave a stray follow on the test account.
import { expect, test } from '@playwright/test';
import { purgeCollection, readEnv, signIn, TEST_DID } from './helpers/live.js';
import { COOK_FOLLOW_COLLECTION } from '../../src/social/cook-follows-pds.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';
const APP_PASSWORD = env['BSKY_TEST_APP_PASSWORD'] ?? '';

// A stable, real account that is NOT one of the four starter cooks (arecipe,
// rdur.dev, recipe.exchange, daffl.xyz) and NOT the test account itself — so the
// merged member resolves to the `added` source (which outranks a bsky `follow`),
// giving it the per-row unfollow control. It needs no recipes: this spec proves
// the follow-RECORD lifecycle, not a feed.
const SUBJECT_HANDLE = 'bsky.app';

const listCookFollowSubjects = async (): Promise<string[]> => {
  const url = `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${TEST_DID}&collection=${COOK_FOLLOW_COLLECTION}&limit=100`;
  const body = (await (await fetch(url)).json()) as {
    records?: { value?: { subject?: unknown } }[];
  };
  return (body.records ?? [])
    .map((r) => r.value?.subject)
    .filter((s): s is string => typeof s === 'string');
};

const resolveHandleToDid = async (handle: string): Promise<string> => {
  const url = `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`;
  const body = (await (await fetch(url)).json()) as { did?: string };
  if (typeof body.did !== 'string') throw new Error(`could not resolve ${handle}`);
  return body.did;
};

const purgeCookFollows = (): Promise<void> =>
  purgeCollection(COOK_FOLLOW_COLLECTION, { handle: HANDLE, appPassword: APP_PASSWORD });

test('@live cookFollow round-trip: follow writes one public record, unfollow removes it', async ({
  page,
  baseURL,
}) => {
  test.skip(
    HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '',
    'needs BSKY_TEST_* credentials in .env',
  );
  test.setTimeout(180_000);
  await purgeCookFollows(); // crash-safe pre-run

  try {
    const subjectDid = await resolveHandleToDid(SUBJECT_HANDLE);

    await signIn(page, {
      handle: HANDLE,
      password: PASSWORD,
      origin: baseURL ?? 'http://127.0.0.1:4173',
    });
    await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

    // Follow through the Account members add panel — the real create path.
    await expect(page.getByTestId('add-cook-input')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('add-cook-input').fill(SUBJECT_HANDLE);
    await page.getByTestId('add-cook-submit').click();

    // Exactly one public cookFollow record now exists, with that subject — the
    // evidence that a novel app.arecipe.* collection round-trips like mealPlan.
    await expect
      .poll(listCookFollowSubjects, { timeout: 30_000 })
      .toEqual([subjectDid]);

    // The added cook renders with a per-row unfollow (the `added` source).
    const unfollow = page.getByTestId('unfollow-cook');
    await expect(unfollow).toBeVisible({ timeout: 30_000 });

    // Unfollow → the record is deleted from the PDS.
    await unfollow.click();
    await expect.poll(listCookFollowSubjects, { timeout: 30_000 }).toEqual([]);
  } finally {
    await purgeCookFollows(); // teardown — runs even if an assertion above threw
  }
});
