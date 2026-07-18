// Agents-page run, Phase 3: the three agent-facing endpoints ship in the
// built dist and are reachable — /llms.txt (discovery index), /agents.md
// (canonical guide), /agents.html (generated human-readable mirror) — and the
// site-wide footer links to the mirror. Content correctness is guarded by the
// unit lints (tests/unit/agents/); here we prove the wiring end to end.
import { expect, test } from '@playwright/test';

test('/llms.txt is served, spec-shaped, and free of placeholders', async ({ request }) => {
  const res = await request.get('/llms.txt');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body.startsWith('# arecipe')).toBe(true);
  expect(body).toContain('https://arecipe.app/agents.md');
  expect(body).not.toContain('DRAFT');
});

test('/agents.md is served with the four-part guide', async ({ request }) => {
  const res = await request.get('/agents.md');
  expect(res.status()).toBe(200);
  const body = await res.text();
  for (const part of ['## Part A ', '## Part B ', '## Part C ', '## Part D ']) {
    expect(body).toContain(part);
  }
  expect(body).not.toContain('DRAFT');
});

test('/agents.html renders the mirror with the site stylesheet', async ({ page }) => {
  await page.goto('/agents.html');
  await expect(page.locator('main.agents-page h1')).toBeVisible();
  await expect(page.locator('h2[id^="part-a"]')).toBeVisible();
  // The shared stylesheet actually applied (body font comes from the theme),
  // not just linked: a bare UA-styled page would render serif Times.
  const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(fontFamily).not.toMatch(/^Times/);
});

test('the site-wide footer links to the agents page', async ({ page }) => {
  await page.goto('/');
  const link = page.getByTestId('agents-link');
  await expect(link).toHaveAttribute('href', './agents.html');
  await link.click();
  await expect(page).toHaveURL(/agents\.html$/);
  await expect(page.locator('main.agents-page h1')).toBeVisible();
});

// Mobile-fit (house guard): no horizontal overflow at phone widths — code
// blocks and long URLs must scroll or wrap inside the page, not widen it.
for (const width of [320, 360, 390]) {
  test(`no horizontal overflow: agents @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto('/agents.html');
    await page.locator('main.agents-page h1').waitFor({ timeout: 15_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `agents.html @ ${width}px overflows`).toBeLessThanOrEqual(1);
  });
}
