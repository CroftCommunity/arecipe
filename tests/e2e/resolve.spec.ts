// Phase 2 wiring test: the shell's sign-in input reaches the resolver
// end-to-end (entry point → resolveHandle → DID doc → PDS displayed).
// Hermetic: resolver network is served from recorded fixtures via Playwright
// route interception (the @live variant of this journey is the Phase 2
// manual validation).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

const routeIdentityFixtures = async (page: Page): Promise<void> => {
  await page.route('https://public.api.bsky.app/**', async (route) => {
    const url = route.request().url();
    if (url.includes('resolveHandle') && url.includes('ngvalidation2112')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: fixture('resolveHandle-ngvalidation2112.json') });
    } else {
      await route.fulfill({ status: 400, contentType: 'application/json', body: fixture('resolveHandle-unresolvable.json') });
    }
  });
  await page.route('https://plc.directory/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: fixture('plc-diddoc-ngvalidation2112.json') });
  });
};

test('entering a handle displays its resolved PDS (wiring)', async ({ page }) => {
  await routeIdentityFixtures(page);
  await page.goto('/');
  await page.getByTestId('handle-input').fill('ngvalidation2112.bsky.social');
  await page.getByTestId('resolve-submit').click();
  await expect(page.getByTestId('resolved-pds')).toHaveText(
    'PDS: https://stropharia.us-west.host.bsky.network',
  );
});

test('an unresolvable handle surfaces the failure in the UI', async ({ page }) => {
  await routeIdentityFixtures(page);
  await page.goto('/');
  await page.getByTestId('handle-input').fill('definitely-not-real-xyz9.bsky.social');
  await page.getByTestId('resolve-submit').click();
  await expect(page.getByTestId('resolved-pds')).toContainText('Unable to resolve handle');
});
