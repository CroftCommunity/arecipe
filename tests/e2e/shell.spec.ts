// Phase 1 wiring + observability tests, run against the BUILT bundle.
// - Wiring: the entry point (index.html → main.js) renders the shell.
// - Diagnostic logging: SW registration is observable at info with ?debug=1,
//   and the console stays quiet of [arecipe] debug/info noise without it.
import { expect, test, type Page } from '@playwright/test';

const collectAppLogs = (page: Page): string[] => {
  const lines: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith('[arecipe]')) lines.push(`${msg.type()}|${text}`);
  });
  return lines;
};

test('shell renders from the built bundle (wiring)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('arecipe');
  // The leading "a" is differentiated so the wordmark reads "a recipe".
  await expect(page.locator('h1 .wordmark-a')).toHaveText('a');
  await expect(page.getByTestId('tab-browse')).toBeVisible();
});

test('colophon: one-action copyright + source link under the build stamp', async ({ page }) => {
  await page.goto('/');
  const colophon = page.getByTestId('colophon');
  await expect(colophon).toContainText('© 2026 Chase Pettet');
  await expect(colophon).toHaveAttribute(
    'href',
    'https://github.com/CroftCommunity/arecipe',
  );
});

test('service-worker registration is logged at info with ?debug=1', async ({ page }) => {
  const lines = collectAppLogs(page);
  await page.goto('/?debug=1');
  await expect
    .poll(() => lines.filter((l) => l.startsWith('info|[arecipe] sw registered')), {
      timeout: 15_000,
    })
    .toHaveLength(1);
});

test('build stamp is visible in the footer (M1 bundle-visibility rider)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('build-stamp')).toHaveText(/^v.+ · .+ KB \(.+ KB gz\)$/, {
    timeout: 10_000,
  });
});

test('production console is quiet: no [arecipe] debug/info without the flag', async ({ page }) => {
  const lines = collectAppLogs(page);
  await page.goto('/');
  // Give the SW registration time to complete — its logs must NOT appear.
  await page.waitForTimeout(2_000);
  expect(lines.filter((l) => l.startsWith('log|') || l.startsWith('info|'))).toEqual([]);
});
