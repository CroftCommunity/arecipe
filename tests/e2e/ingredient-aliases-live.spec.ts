// Community ingredient aliases — the signed-in round-trip against the real PDS
// (@live, plans/2026-09-14-plan-community-ingredient-aliases.md). Evidence
// that a novel app.arecipe.ingredientAlias record round-trips like cookFollow
// did: seed one device-local correction → sign in → Publish → the account's
// public listRecords shows exactly one record with that name and key → clear
// the device → Pull from account → the correction is back on the device.
// Everything this spec creates it deletes: a whole-collection purge runs
// before AND after, hard-scoped to TEST_DID.
import { expect, test } from '@playwright/test';
import { LIVE_CREDS_HINT, TEST_DID, purgeCollection, readEnv, signIn } from './helpers/live.js';
import { INGREDIENT_ALIAS_COLLECTION } from '../../src/recipes/ingredient-aliases-pds.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';
const APP_PASSWORD = env['BSKY_TEST_APP_PASSWORD'] ?? '';

const listAliases = async (): Promise<{ name: string; key: string }[]> => {
  const url = `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${TEST_DID}&collection=${INGREDIENT_ALIAS_COLLECTION}&limit=100`;
  const body = (await (await fetch(url)).json()) as { records?: { value?: { name?: unknown; key?: unknown } }[] };
  return (body.records ?? [])
    .map((r) => r.value)
    .filter((v): v is { name: string; key: string } => typeof v?.name === 'string' && typeof v?.key === 'string')
    .map((v) => ({ name: v.name, key: v.key }));
};

test.describe('@live ingredient aliases', () => {
  test.skip(HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '', LIVE_CREDS_HINT);
  test.beforeEach(async () => purgeCollection(INGREDIENT_ALIAS_COLLECTION, { handle: HANDLE, appPassword: APP_PASSWORD }));
  test.afterEach(async () => purgeCollection(INGREDIENT_ALIAS_COLLECTION, { handle: HANDLE, appPassword: APP_PASSWORD }));

  test('publish a device correction as a record, pull it back onto a cleared device', async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    // Seed ONCE (not addInitScript, which would re-plant it on every load and
    // defeat the "cleared device" step below).
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('ingredient-corrections', JSON.stringify([{ name: 'freeze-dried strawberry', key: 'strawberry', confirmedAt: '2026-09-14T00:00:00Z' }]));
    });
    await signIn(page, { handle: HANDLE, password: PASSWORD, origin: baseURL ?? 'http://127.0.0.1:4173' });
    const block = page.getByTestId('ingredient-alias-sync');
    await expect(block).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('corrections-publish')).toHaveText('Publish 1 to your account');
    await page.getByTestId('corrections-publish').click();
    await expect(page.getByTestId('corrections-publish')).toHaveText('Published', { timeout: 30_000 });
    await expect.poll(listAliases, { timeout: 30_000 }).toEqual([{ name: 'freeze-dried strawberry', key: 'strawberry' }]);

    // A cleared device pulls it back.
    await page.evaluate(() => localStorage.removeItem('ingredient-corrections'));
    await page.reload();
    await expect(page.getByTestId('corrections-sync-counts')).toContainText('0 on this device');
    await page.getByTestId('corrections-pull').click();
    await expect(page.getByTestId('corrections-sync-status')).toContainText('Pulled 1', { timeout: 30_000 });
    await expect(page.getByTestId('corrections-sync-counts')).toContainText('1 on this device, 1 on your account');
    const local = await page.evaluate(() => localStorage.getItem('ingredient-corrections'));
    expect(local).toContain('"freeze-dried strawberry"');
    expect(local).toContain('"strawberry"');
  });
});
