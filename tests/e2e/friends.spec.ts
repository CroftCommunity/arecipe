// Phase 9a wiring (hermetic half): the friends social graph. Mirrors the
// Phase 6 split — writes (addFriend/removeFriend) are proven in the @live
// tier (friends-live.spec.ts); here we prove, with no credentials:
//   - the Friends tab exists and navigates between real documents
//   - signed-out, the page shows the "sign in to add friends" gate
//   - the friends READ feed renders via the shareable friends.html?did=<did>
//     cold-view, over routed plc/PDS fixtures (a friend's public recipes)
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');
const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

const FRIEND_COLLECTION = 'app.arecipe.friend';
// The account whose public friends we view via ?did=.
const VIEWED = { did: 'did:plc:viewed0000000000000000aa', pds: 'https://viewed.test' };
// Their one friend, whose recipes should fill the feed.
const FRIEND = { did: 'did:plc:friend0000000000000000aa', pds: 'https://friend.test' };

const routeFriendsFixtures = async (page: Page): Promise<void> => {
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    alsoKnownAs?: string[];
    service: { serviceEndpoint: string }[];
  };
  const pdsByDid: Record<string, string> = { [VIEWED.did]: VIEWED.pds, [FRIEND.did]: FRIEND.pds };
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    const pds = pdsByDid[did];
    if (pds === undefined) return route.fulfill({ status: 404, body: '{}' });
    const doc = {
      ...template,
      id: did,
      alsoKnownAs: [`at://${did === FRIEND.did ? 'friend.example.com' : 'viewed.example.com'}`],
      service: [{ ...template.service[0]!, serviceEndpoint: pds }],
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  // The viewed account's PDS serves its app.arecipe.friend list: one friend.
  await page.route(`${VIEWED.pds}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        records: [
          {
            uri: `at://${VIEWED.did}/${FRIEND_COLLECTION}/rk1`,
            value: { subject: FRIEND.did, createdAt: '2026-07-08T00:00:00Z' },
          },
        ],
      }),
    });
  });
  // The friend's PDS serves the recorded 3-recipe list, re-uri'd to them.
  await page.route(`${FRIEND.pds}/**`, async (route) => {
    const list = JSON.parse(atprotoFixture('listRecords-exchange.recipe.recipe.json')) as {
      records: { uri: string }[];
    };
    for (const r of list.records) r.uri = r.uri.replace(/did:plc:[a-z0-9]+/, FRIEND.did);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) });
  });
};

test('the Friends tab exists and navigates from Browse (wiring)', async ({ page }) => {
  await page.goto('/');
  const tab = page.getByTestId('tab-friends');
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page).toHaveURL(/friends\.html/);
});

test('signed-out, the friends page shows the sign-in-to-add gate', async ({ page }) => {
  await page.goto('/friends.html');
  await expect(page.getByTestId('friends-signed-out')).toBeVisible();
  await expect(page.getByTestId('friends-signed-out')).toContainText(/sign in/i);
});

test('friends.html?did= renders that account’s friends’ recipes (read feed)', async ({
  page,
}) => {
  await routeFriendsFixtures(page);
  await page.goto(`/friends.html?did=${encodeURIComponent(VIEWED.did)}`);
  await expect(page.getByTestId('recipe-item').first()).toBeVisible({ timeout: 15_000 });
  // The one friend contributes the 3-recipe fixture.
  await expect(page.getByTestId('recipe-item')).toHaveCount(3);
});
