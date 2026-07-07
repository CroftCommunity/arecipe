import { defineConfig } from '@playwright/test';

// Default run = hermetic tier only: @live tests (real PDS, credentials from
// .env) are excluded here and run via `npm run test:live` as phase gates.
export default defineConfig({
  testDir: 'tests/e2e',
  grepInvert: process.env['LIVE'] === '1' ? undefined : /@live/,
  grep: process.env['LIVE'] === '1' ? /@live/ : undefined,
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'npm run serve',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
