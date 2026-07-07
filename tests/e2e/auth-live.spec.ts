// Phase 3 wiring test (@live tier): a real OAuth login against the real PDS,
// then a reload proving the session persists (library-owned IndexedDB store).
// Runs via `npm run test:live` with the out-of-band credential in .env —
// NEVER in push CI (drives bsky.social's third-party login/consent pages).
import { expect, test } from '@playwright/test';
import { readEnv, signIn } from './helpers/live.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';

test('@live login persists across a reload (loopback OAuth, real PDS)', async ({ page, baseURL }) => {
  test.skip(HANDLE === '' || PASSWORD === '', 'needs BSKY_TEST_HANDLE/PASSWORD in .env');
  test.setTimeout(120_000);

  await signIn(page, {
    handle: HANDLE,
    password: PASSWORD,
    origin: baseURL ?? 'http://127.0.0.1:4173',
  });

  // Back in the app with a live session.
  await expect(page.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });

  // The wiring claim: persistence across a reload, no re-login.
  await page.reload();
  await expect(page.getByTestId('signed-in-did')).toContainText('did:plc:', { timeout: 30_000 });
});
