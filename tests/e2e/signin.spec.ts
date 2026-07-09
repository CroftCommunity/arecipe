// Dedicated sign-in page (plans/2026-07-08-2-plan-dedicated-signin-page.md).
// Wiring test: signin.html is a real document reachable by URL, and on the
// loopback test origin (provider !== null, no session) it renders the
// dedicated sign-in form. The interactive OAuth round-trip is NOT proven
// here — it is the feature, and lives in the loopback/@live tier (mirroring
// the Phase 3 precedent). This spec covers branch (1): signed-out → form.
import { expect, test } from '@playwright/test';

test('signin page renders the dedicated sign-in form when signed out (wiring)', async ({
  page,
}) => {
  await page.goto('/signin.html');
  // A real, dedicated login document — not a section on another page.
  await expect(page).toHaveTitle(/sign in/i);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  // The form the entry point must reach: handle field + OAuth submit + status.
  await expect(page.getByTestId('handle-input')).toBeVisible();
  await expect(page.getByTestId('oauth-signin')).toBeVisible();
  await expect(page.getByTestId('signin-status')).toBeAttached();
});
