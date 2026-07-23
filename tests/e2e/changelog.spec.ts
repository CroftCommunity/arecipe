// Changelog page wiring (hermetic): the page fetches ./changelog.json and renders
// a timeline. We intercept changelog.json with a fixture so the assertions don't
// depend on the repo's real commit history. The pure render logic is unit-tested
// in tests/unit/pages/changelog-view.spec.ts; this covers fetch + wire + footer.
import { expect, test } from '@playwright/test';

const FIXTURE = {
  generatedAt: '2026-07-23T00:00:00Z',
  entries: [
    {
      date: '2026-07-22',
      category: 'added',
      text: 'Added a shopping list you can check off',
      sha: 'abc1234def0',
      shortSha: 'abc1234',
      commitUrl: 'https://github.com/CroftCommunity/arecipe/commit/abc1234def0',
      pr: 40,
      prUrl: 'https://github.com/CroftCommunity/arecipe/pull/40',
    },
    {
      date: '2026-07-20',
      category: 'fixed',
      text: 'Fixed ingredient scaling on halved recipes',
      sha: 'def5678abc0',
      shortSha: 'def5678',
      commitUrl: 'https://github.com/CroftCommunity/arecipe/commit/def5678abc0',
    },
  ],
};

test('renders entries fetched from changelog.json', async ({ page }) => {
  await page.route('**/changelog.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) }),
  );
  await page.goto('/changelog.html');
  await expect(page.getByTestId('changelog-title')).toBeVisible();
  await expect(page.getByTestId('changelog-entry')).toHaveCount(2);
  await expect(page.getByTestId('cl-category').first()).toHaveText('added');
  await expect(page.getByText('Added a shopping list you can check off')).toBeVisible();
  await expect(page.getByTestId('cl-commit').first()).toHaveAttribute('href', /\/commit\/abc1234def0$/);
  await expect(page.getByTestId('cl-pr').first()).toHaveText('#40');
});

test('shows the empty-state when there are no entries', async ({ page }) => {
  await page.route('**/changelog.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [] }) }),
  );
  await page.goto('/changelog.html');
  await expect(page.getByTestId('changelog-empty')).toBeVisible();
});

test('the footer links to the changelog from another page', async ({ page }) => {
  await page.goto('/index.html');
  const link = page.getByTestId('changelog-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', './changelog.html');
});
