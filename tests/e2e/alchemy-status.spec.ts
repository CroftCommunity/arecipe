// Phase 11c wiring (hermetic — drafts are local-first, no auth): set a draft's
// status in the editor, then filter the Alchemy drafts list by status. Both
// edges: the matching status shows, the others hide; "All" restores everything.
import { expect, test } from '@playwright/test';

const saveDraft = async (
  page: import('@playwright/test').Page,
  name: string,
  status: 'draft' | 'cooking' | 'ready',
): Promise<void> => {
  await page.goto('/editor.html');
  await page.getByTestId('editor-name').fill(name);
  await page.getByTestId('editor-status-select').selectOption(status);
  await page.getByTestId('save-draft').click();
  await expect(page.getByTestId('editor-status')).toContainText('draft saved', { timeout: 15_000 });
};

test('Alchemy filters drafts by the status set in the editor (wiring)', async ({ page }) => {
  await saveDraft(page, 'Cooking Dish', 'cooking');
  await saveDraft(page, 'Ready Dish', 'ready');

  await page.goto('/mine.html');
  await expect(page.getByTestId('draft-row')).toHaveCount(2, { timeout: 15_000 });

  // Filter to "cooking" → only that draft.
  await page.getByTestId('filter-cooking').click();
  await expect(page.getByTestId('draft-row')).toHaveCount(1);
  await expect(page.getByTestId('draft-row')).toContainText('Cooking Dish');

  // Filter to "ready" → only that draft (the other is hidden — both directions).
  await page.getByTestId('filter-ready').click();
  await expect(page.getByTestId('draft-row')).toHaveCount(1);
  await expect(page.getByTestId('draft-row')).toContainText('Ready Dish');

  // "All" restores both.
  await page.getByTestId('filter-all').click();
  await expect(page.getByTestId('draft-row')).toHaveCount(2);
});
