// Phase 11b/11c wiring (@live): a non-default draft status set in the editor
// syncs to the real PDS draft record (closes the status round-trip that the
// hermetic tests prove locally). Guarded by a purge of app.arecipe.draft on the
// test account.
import { expect, test } from '@playwright/test';
import { purgeCollection, readEnv, signIn, TEST_DID } from './helpers/live.js';
import { DRAFT_COLLECTION } from '../../src/recipes/drafts-sync.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';
const APP_PASSWORD = env['BSKY_TEST_APP_PASSWORD'] ?? '';

test('@live a "ready" draft status set in the editor reaches the PDS record', async ({
  page,
  baseURL,
}) => {
  test.skip(HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '', 'needs BSKY_TEST_* creds');
  test.setTimeout(180_000);
  await purgeCollection(DRAFT_COLLECTION, { handle: HANDLE, appPassword: APP_PASSWORD });

  await signIn(page, { handle: HANDLE, password: PASSWORD, origin: baseURL ?? 'http://127.0.0.1:4173' });
  await expect(page.getByTestId('signed-in-did')).toContainText(TEST_DID, { timeout: 30_000 });

  await page.goto('/editor.html');
  await page.getByTestId('editor-name').fill('Ready Live Draft');
  await page.getByTestId('editor-status-select').selectOption('ready');
  await page.getByTestId('save-draft').click();
  await expect(page.getByTestId('editor-status')).toContainText('backed up to your account', {
    timeout: 30_000,
  });

  // The synced record on the PDS carries the chosen status.
  const res = await page.request.get(
    `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${TEST_DID}&collection=${DRAFT_COLLECTION}&limit=10`,
  );
  const body = (await res.json()) as { records: { value: { status?: string } }[] };
  expect(body.records.map((r) => r.value.status)).toContain('ready');
});
