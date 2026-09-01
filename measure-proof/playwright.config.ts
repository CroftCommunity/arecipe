import { defineConfig } from '@playwright/test';

// E5 harness config. Points at the environment's installed Chromium (the
// npm-pinned build number differs from what's on disk — see arecipe CLAUDE.md).
// Adjust executablePath if /opt/pw-browsers holds a different build.
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 4180;

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: { executablePath: CHROME },
  },
  webServer: {
    command: `node harness/server.mjs`,
    url: `http://127.0.0.1:${PORT}/_stats`,
    reuseExistingServer: false,
    timeout: 20_000,
    env: { PORT: String(PORT) },
  },
});
