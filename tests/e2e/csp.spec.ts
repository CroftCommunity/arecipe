// Phase 2 wiring test: build-time CSP is injected into every built document and
// the enforcing policy admits the app's own inline scripts + assets — i.e. no
// securitypolicyviolation fires when each page is loaded through the real
// document. The empty-violations assertion is the gate; asserting a meta string
// merely exists proves nothing (Phase 0 D2). Phase 3 extends this file with SRI
// assertions; Phase 4 with the zero-third-party guard.
//
// TDD note (Phase 0 D2): a "zero violations" assertion is trivially green when
// no CSP exists, so the RED driver here is the meta-presence / hash /
// connect-src assertions — they fail against a no-CSP build.
import { expect, test, type Page } from '@playwright/test';

// The three inline-script hashes confirmed byte-exact against the browser in
// Phase 0 D2. Each shell must admit the theme pre-paint block; index.html also
// the landing block; friends.html only its redirect stub.
const HASH_THEME = "'sha256-FZCh04/evgapIEHhqDZ2QN+jSctIo/PmzHFZCcGVwlA='";
const HASH_INDEX_LANDING = "'sha256-AFuWlNTFNFOiaCN/V9holAXSCcoVXtnsje4QkAYG/CI='";
const HASH_FRIENDS = "'sha256-oEG+8rARcF5NdiN3bUoe+M8OmKs3aT23yOBbuduJvQQ='";

// The OQ1 connect-src origins that must appear in every document's policy.
const CONNECT_ORIGINS = [
  "'self'",
  'https://bsky.social',
  'https://public.api.bsky.app',
  'https://plc.directory',
  'https:',
];

// Shells that carry a page bundle + the theme pre-paint inline script.
const SHELLS = [
  'index.html', 'mine.html', 'cookbook.html', 'settings.html',
  'account.html', 'recipe.html', 'editor.html', 'signin.html',
];

// Install the violation collector before any page script runs.
const installCollector = (page: Page) =>
  page.addInitScript(() => {
    (window as unknown as { __csp: unknown[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: unknown[] }).__csp.push({
        directive: e.violatedDirective,
        blocked: e.blockedURI,
        line: e.lineNumber,
      });
    });
  });

const readViolations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp: unknown[] }).__csp);

// Read the enforced CSP <meta content=""> for the current document, and the
// ordinal positions of the charset meta, the CSP meta, and the first inline
// <script>, so we can assert the CSP precedes the inline scripts.
const readCspMeta = (page: Page) =>
  page.evaluate(() => {
    const head = document.head;
    const kids = [...head.children];
    const csp = head.querySelector('meta[http-equiv="Content-Security-Policy" i]');
    const charset = head.querySelector('meta[charset]');
    const firstInline = [...head.querySelectorAll('script')].find((s) => !s.src);
    return {
      content: csp?.getAttribute('content') ?? null,
      charsetIsFirstChild: kids[0] === charset,
      cspIndex: csp ? kids.indexOf(csp) : -1,
      firstInlineIndex: firstInline ? kids.indexOf(firstInline) : -1,
    };
  });

test.describe('CSP: enforcing policy admits every document (Phase 2)', () => {
  for (const doc of SHELLS) {
    test(`${doc}: zero violations + correct meta`, async ({ page }) => {
      await installCollector(page);
      await page.goto(`/${doc}`, { waitUntil: 'load' });
      // Exercise a real render: signin mounts its form; other shells render
      // their app root. Either way the entry module has executed by now.
      if (doc === 'signin.html') {
        await expect(page.getByTestId('handle-input')).toBeVisible();
      } else {
        await expect(page.locator('#app')).toBeAttached();
      }
      await page.waitForTimeout(300);

      const meta = await readCspMeta(page);
      expect(meta.content, `${doc} carries an enforcing CSP meta`).not.toBeNull();
      // charset stays the genuine first child; CSP meta precedes inline scripts.
      expect(meta.charsetIsFirstChild, `${doc}: <meta charset> is first head child`).toBe(true);
      expect(meta.cspIndex, `${doc}: CSP meta present`).toBeGreaterThanOrEqual(0);
      expect(
        meta.cspIndex < meta.firstInlineIndex,
        `${doc}: CSP meta (idx ${meta.cspIndex}) must precede first inline script (idx ${meta.firstInlineIndex})`,
      ).toBe(true);

      const csp = meta.content ?? '';
      expect(csp, `${doc}: theme hash in script-src`).toContain(HASH_THEME);
      if (doc === 'index.html') {
        expect(csp, 'index.html: landing hash in script-src').toContain(HASH_INDEX_LANDING);
      }
      for (const origin of CONNECT_ORIGINS) {
        expect(csp, `${doc}: connect-src contains ${origin}`).toContain(origin);
      }

      const violations = await readViolations(page);
      expect(violations, `${doc} CSP violations: ${JSON.stringify(violations)}`).toEqual([]);
    });
  }

  // friends.html has no #app and redirects via its inline stub. A successful
  // redirect to cookbook proves the stub executed under CSP (its hash admitted
  // it); a blocked stub would leave the URL on friends.html.
  test('friends.html: stub runs under CSP → redirects to cookbook', async ({ page }) => {
    await installCollector(page);
    await page.goto('/friends.html?did=probe#frag', { waitUntil: 'load' });
    await page.waitForURL(/\/cookbook\.html/, { timeout: 5_000 });
    expect(page.url()).toContain('/cookbook.html');
    // Query + hash preserved by the stub.
    expect(page.url()).toContain('did=probe');
  });

  // Static-source assertion: friends.html's built output carries the CSP meta
  // with its own stub hash (it is copied outside the HTML loop, so this guards
  // the easy-to-miss path). Read the served document text directly.
  test('friends.html: built document carries CSP meta with the stub hash', async ({ request }) => {
    const res = await request.get('/friends.html');
    const html = await res.text();
    expect(html).toMatch(/http-equiv="Content-Security-Policy"/i);
    expect(html).toContain(HASH_FRIENDS);
    // CSP meta must appear before the inline <script> in source order.
    const cspAt = html.search(/http-equiv="Content-Security-Policy"/i);
    const scriptAt = html.search(/<script>/i);
    expect(cspAt).toBeGreaterThanOrEqual(0);
    expect(cspAt).toBeLessThan(scriptAt);
  });
});
