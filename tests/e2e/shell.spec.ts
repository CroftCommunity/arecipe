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
  await expect(page.locator('h1')).toHaveText('arecipe — no recipes yet');
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

test('production console is quiet: no [arecipe] debug/info without the flag', async ({ page }) => {
  const lines = collectAppLogs(page);
  await page.goto('/');
  // Give the SW registration time to complete — its logs must NOT appear.
  await page.waitForTimeout(2_000);
  expect(lines.filter((l) => l.startsWith('log|') || l.startsWith('info|'))).toEqual([]);
});
