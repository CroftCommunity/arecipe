// Reference page: static kitchen charts, reachable from the top bar and
// directly linkable per chart. Verifies the nav wiring, that the charts render
// as tables, and that deep-linking to a chart's fragment lands on it.
import { expect, test } from '@playwright/test';

test('the top bar links to the Reference page and it renders the charts', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tab-reference').click();
  await expect(page).toHaveURL(/reference\.html$/);

  // The five transcribed charts each render as a table.
  await expect(page.locator('section.ref-card table')).toHaveCount(6); // weights = 2 tables
  await expect(page.locator('#weights-and-measures')).toContainText('3 teaspoons');
  await expect(page.locator('#substitutions')).toContainText('1 tablespoon cornstarch');
  await expect(page.locator('#can-sizes')).toContainText('No. 10');
  await expect(page.locator('#roasting-meat')).toContainText('Well-Done');
  await expect(page.locator('#roasting-poultry')).toContainText('Chicken / Capon');

  // Native back returns to Browse — real documents, no SPA router.
  await page.goBack();
  await expect(page.getByTestId('handle-input')).toBeVisible();
});

test('each chart is directly linkable via a copyable # anchor', async ({ page }) => {
  await page.goto('/reference.html');
  // Every section carries an anchor whose href is its own fragment.
  const anchor = page.locator('#roasting-poultry a.ref-anchor');
  await expect(anchor).toHaveAttribute('href', '#roasting-poultry');
});

test('deep-linking to a chart fragment scrolls it into view and highlights it', async ({
  page,
}) => {
  await page.goto('/reference.html#roasting-poultry');
  const target = page.locator('#roasting-poultry');
  await expect(target).toBeInViewport();
  // :target styling lands the deep link obviously (enamel border wash).
  await expect(target).toHaveCSS('border-top-color', 'rgb(23, 94, 84)');
});
