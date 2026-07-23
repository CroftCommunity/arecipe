import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Block the service worker: it bypasses page.route and can serve a cached /
// pre-theme shell, so the scan must run against a freshly-rendered page.
test.use({ serviceWorkers: 'block' });

// Automated accessibility scan (adopted from croft-pwa/skylite). The listed
// pages, both themes (contrast is theme-dependent), must have zero serious/
// critical axe violations.
//
// HERMETIC by construction: all cross-origin requests are blocked, so each page
// renders the same offline shell everywhere (a networked runner would otherwise
// fetch live atproto content and scan a different DOM than CI). This gates the
// shell chrome (topbar, tabs, footer, forms, empty/offline states). The heavy
// data pages (browse/recipe/cookbook/meals/account/dish/editor) render a
// state/network-dependent surface and are covered by their feature specs, not
// this shell gate.
const PAGES = [
  '/settings.html',
  '/reference.html',
  '/user-guide.html',
  '/timers.html',
  '/signin.html',
  '/changelog.html',
];

for (const path of PAGES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`a11y: ${path} (${theme}) — no serious/critical violations`, async ({ page }) => {
      await page.addInitScript((t) => {
        try {
          if (t === 'dark') localStorage.setItem('theme', 'dark');
        } catch {
          /* private mode */
        }
      }, theme);
      await page.route('**/*', (route) => {
        const host = new URL(route.request().url()).hostname;
        if (host === 'localhost' || host === '127.0.0.1') void route.continue();
        else void route.abort();
      });
      await page.goto(path, { waitUntil: 'load' });
      // Scan the SETTLED DOM: at 'load' the page is still pre-render (the JS mounts
      // the shell and applies the theme after load), and axe would catch that
      // transitional state. Wait for the footer (mounted by the shell) and a brief
      // settle so the theme + styles are applied before the scan.
      await page.locator('footer').first().waitFor({ timeout: 8000 });
      await page.waitForTimeout(600);

      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} (${v.impact ?? '?'}) × ${v.nodes.length}`);

      expect(blocking, blocking.join(' · ')).toEqual([]);
    });
  }
}
