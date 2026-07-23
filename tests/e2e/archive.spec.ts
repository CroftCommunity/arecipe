// RUN-LAST-PLANNED (D7) archive page wiring. Like the published-plans subpage,
// the archive is a signed-in Meals-surface view (it reads your own plan
// records); the signed-in render — the stats block and the archived ranges — is
// exercised @live and unit-tested (partitionPlans / plannedStats). Hermetically,
// with no session, we prove the page is wired and built: it invites sign-in and
// links back to the published list, and nothing errors.
import { expect, test } from '@playwright/test';

test('archive page: signed out, it invites sign-in and links back to the published list (21)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/archive.html');
  await expect(page.getByTestId('archive-body')).toContainText('Sign in', { timeout: 15_000 });
  await expect(page.getByTestId('archive-back')).toHaveAttribute('href', /meals\.html\?plans$/);
  expect(errors).toEqual([]);
});
