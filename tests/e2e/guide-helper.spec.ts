// RUN-GUIDE-HELPER Phase 1 (RED), e2e — tests 13..15. The question box on the
// user guide: ask a question, get ranked deep links, click one and land on the
// exact section, scrolled into view and highlighted. Works with no model, and
// says nothing about a missing one.
import { expect, test } from '@playwright/test';

test('typing a question shows ranked results with breadcrumbs and deep links', async ({ page }) => {
  await page.goto('/user-guide.html');
  const helper = page.getByTestId('guide-helper');
  await expect(helper).toBeVisible();

  await page.getByTestId('guide-helper-input').fill('how do I make a shopping list from my plan');
  await page.getByTestId('guide-helper-submit').click();

  const results = page.getByTestId('guide-result');
  await expect(results.first()).toBeVisible();
  const top = results.first();
  await expect(top).toHaveAttribute('href', '#guide-entry-shopping');
  await expect(top).toContainText('Shopping lists');
});

test('clearing the question box resets the page back to no results', async ({ page }) => {
  await page.goto('/user-guide.html');
  const input = page.getByTestId('guide-helper-input');
  await input.fill('how do I make a shopping list from my plan');
  await page.getByTestId('guide-helper-submit').click();
  await expect(page.getByTestId('guide-result').first()).toBeVisible();

  // Emptying the box (native clear control, or deleting the text) drops the
  // results — the helper is back to its default state.
  await input.fill('');
  await expect(page.getByTestId('guide-result')).toHaveCount(0);
});

test('clicking a result lands on the section, scrolled into view and highlighted', async ({
  page,
}) => {
  await page.goto('/user-guide.html');
  await page.getByTestId('guide-helper-input').fill('what is focus mode');
  await page.getByTestId('guide-helper-submit').click();

  const top = page.getByTestId('guide-result').first();
  await expect(top).toHaveAttribute('href', '#guide-entry-focus');
  await top.click();

  await expect(page).toHaveURL(/#guide-entry-focus$/);
  const target = page.getByTestId('guide-entry-focus');
  await expect(target).toBeInViewport();
  // Visibly highlighted so the user can see they landed in the right place (D3).
  await expect(target).toHaveClass(/guide-target/);
});

test('the helper works with no model and no copy mentions one (test 15, D6)', async ({ page }) => {
  await page.goto('/user-guide.html');
  await page.getByTestId('guide-helper-input').fill('how do I follow a cook');
  await page.getByTestId('guide-helper-submit').click();

  await expect(page.getByTestId('guide-result').first()).toHaveAttribute(
    'href',
    '#guide-entry-add-cook',
  );
  // Nothing anywhere on the page confesses a missing model.
  await expect(page.locator('body')).not.toContainText(/\bAI unavailable\b/i);
  await expect(page.getByTestId('guide-helper')).not.toContainText(/\bmodel\b/i);
});
