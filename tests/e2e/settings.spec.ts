// Settings page. The "Only show me" dietary preference moved to the Account
// page's Taste section — its suite lives in account.spec.ts.
import { expect, test } from '@playwright/test';

test('settings: Import → Scan a photo (OCR) is on by default and can be disabled', async ({
  page,
}) => {
  await page.goto('/settings.html');
  const section = page.getByTestId('import-settings');
  await expect(section).toBeVisible();
  await expect(section).toContainText('Scan a photo (OCR)');
  const box = section.getByTestId('ocr-enabled').locator('input[type=checkbox]');
  // On by default: checked, nothing stored (absence ⇒ enabled).
  await expect(box).toBeChecked();
  expect(await page.evaluate(() => window.localStorage.getItem('ocr-enabled'))).toBeNull();
  // Turning it off persists the opt-out and survives a reload.
  await box.uncheck();
  expect(await page.evaluate(() => window.localStorage.getItem('ocr-enabled'))).toBe('0');
  await page.reload();
  await expect(
    page.getByTestId('import-settings').getByTestId('ocr-enabled').locator('input'),
  ).not.toBeChecked();
});

test('settings: Import → OCR model defaults to Fast and switches to Standard, persisting', async ({
  page,
}) => {
  await page.goto('/settings.html');
  const select = page.getByTestId('import-settings').getByTestId('ocr-model').locator('select');
  await expect(select).toHaveValue('fast');
  expect(await page.evaluate(() => window.localStorage.getItem('ocr-model'))).toBeNull();
  await select.selectOption('standard');
  expect(await page.evaluate(() => window.localStorage.getItem('ocr-model'))).toBe('standard');
  await page.reload();
  await expect(
    page.getByTestId('import-settings').getByTestId('ocr-model').locator('select'),
  ).toHaveValue('standard');
});

test('settings: Cookbook → Show export toggles the pref off by default and persists', async ({
  page,
}) => {
  await page.goto('/settings.html');
  const section = page.getByTestId('cookbook-settings');
  await expect(section).toBeVisible();
  await expect(section).toContainText('Show export');
  const box = section.getByTestId('cookbook-show-export').locator('input[type=checkbox]');
  // Hidden by default: the box starts unchecked and no pref is stored.
  await expect(box).not.toBeChecked();
  expect(await page.evaluate(() => window.localStorage.getItem('cookbook-show-export'))).toBeNull();
  // Turning it on persists the opt-in.
  await box.check();
  expect(await page.evaluate(() => window.localStorage.getItem('cookbook-show-export'))).toBe('1');
  // …and survives a reload.
  await page.reload();
  await expect(
    page.getByTestId('cookbook-settings').getByTestId('cookbook-show-export').locator('input'),
  ).toBeChecked();
});

test('settings: Hidden recipes is collapsed by default with a count, expandable', async ({
  page,
}) => {
  // Expanding kicks off the name lookup; keep this test hermetic — the row must
  // fall back to the abbreviated id when the lookup can't reach the network.
  await page.route('https://plc.directory/**', (route) => route.abort());
  await page.goto('/settings.html');
  const section = page.getByTestId('hidden-recipes');
  await expect(section).toBeVisible();
  // Collapsed by default: the summary carries a count; rows are hidden until opened.
  const summary = section.locator('summary').first();
  await expect(summary).toContainText(/Hidden recipes \(\d+\)/);
  const firstRow = section.getByTestId('hidden-row').first();
  await expect(firstRow).toBeHidden();
  // Expand → the rows appear, labeled with the short id fallback.
  await summary.click();
  await expect(firstRow).toBeVisible();
  await expect(firstRow.locator('a')).toContainText('01KVQF…Z8K9');
});

test('settings: expanding Hidden recipes resolves entries to recipe names', async ({ page }) => {
  const HIDDEN_URI =
    'at://did:plc:vspq46f5zmrlesaszlyfliy2/exchange.recipe.recipe/01KVQFHYF6PJP7KP84PNCJZ8K9';
  await page.route('https://plc.directory/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'did:plc:vspq46f5zmrlesaszlyfliy2',
        alsoKnownAs: ['at://daffl.xyz'],
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: 'https://hiddenpds.test',
          },
        ],
      }),
    });
  });
  await page.route('https://hiddenpds.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uri: HIDDEN_URI,
        cid: 'bafyreihxrjkyvfu3d3tpm5x6kmoxbpwbnyf7bfgu5g25pfhqcdvfjrpc24',
        value: {
          name: 'Test Recipe',
          text: 'Love',
          ingredients: ['Love'],
          instructions: ['Do the things'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    });
  });

  await page.goto('/settings.html');
  const section = page.getByTestId('hidden-recipes');
  await section.locator('summary').first().click();
  // The baseline entry resolves from its author's PDS to a human-readable name.
  const firstRow = section.getByTestId('hidden-row').first();
  await expect(firstRow.locator('a')).toContainText('Test Recipe');
  // The full URI stays reachable via the link.
  await expect(firstRow.locator('a')).toHaveAttribute('title', HIDDEN_URI);
});
