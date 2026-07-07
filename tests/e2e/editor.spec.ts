// Phase 6 wiring (hermetic half): draft-before-publish. Drafting is local
// and needs no account; publishing is gated on sign-in. The @live publish
// path lives in publish-live.spec.ts.
import { expect, test } from '@playwright/test';

test('author → save draft → reload restores it (draft-before-publish)', async ({ page }) => {
  await page.goto('/editor.html');
  await page.getByTestId('editor-name').fill('Midnight Toast');
  await page.getByTestId('editor-text').fill('Toast, but at midnight.');
  await page.getByTestId('editor-ingredients').fill('2 slices bread\nbutter');
  await page.getByTestId('editor-instructions').fill('Toast the bread.\nButter it.');
  await page.getByTestId('save-draft').click();
  await expect(page.getByTestId('editor-status')).toContainText('draft saved');
  // The URL now names the draft; a reload resumes it.
  await expect(page).toHaveURL(/draft=/);
  await page.reload();
  await expect(page.getByTestId('editor-name')).toHaveValue('Midnight Toast');
  await expect(page.getByTestId('editor-ingredients')).toHaveValue('2 slices bread\nbutter');
});

test('publish is disabled without a session; drafts still save', async ({ page }) => {
  await page.goto('/editor.html');
  await expect(page.getByTestId('publish')).toBeDisabled();
  await expect(page.getByTestId('editor-status')).toContainText(/drafts save locally/);
});

test('drafts appear on My recipes and can be deleted', async ({ page }) => {
  await page.goto('/editor.html');
  await page.getByTestId('editor-name').fill('Draft For Mine');
  await page.getByTestId('save-draft').click();
  await expect(page.getByTestId('editor-status')).toContainText('draft saved');

  await page.goto('/mine.html');
  const row = page.getByTestId('draft-row').filter({ hasText: 'Draft For Mine' });
  await expect(row).toHaveCount(1);
  // The draft row links back into the editor with the draft id.
  await expect(row.locator('a')).toHaveAttribute('href', /editor\.html\?draft=/);
  await row.getByTestId('draft-delete').click();
  await expect(page.getByTestId('draft-row').filter({ hasText: 'Draft For Mine' })).toHaveCount(0);
});
