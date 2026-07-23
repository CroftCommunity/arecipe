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
import { readFileSync } from 'node:fs';

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
  'user-guide.html', 'import.html',
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

  // calendar-setup.html: a static, JS-less guide page copied outside the HTML
  // map. It must load under the enforcing CSP (hashed stylesheet 'self') with
  // zero violations — a regression here means the CSP/SRI wiring for the extra
  // static page broke.
  test('calendar-setup.html: static guide loads under CSP with zero violations', async ({
    page,
  }) => {
    await installCollector(page);
    await page.goto('/calendar-setup.html', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Publish a subscribable calendar' })).toBeVisible();
    await page.waitForTimeout(300);
    const meta = await readCspMeta(page);
    expect(meta.content, 'guide carries an enforcing CSP meta').not.toBeNull();
    expect(meta.charsetIsFirstChild, 'guide: <meta charset> is first head child').toBe(true);
    const violations = await readViolations(page);
    expect(violations, `guide CSP violations: ${JSON.stringify(violations)}`).toEqual([]);
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

// Phase 3: SRI on the entry ES module + both stylesheets. An SRI mismatch
// blocks the subresource (browser console error, not a CSP violation), so the
// proof is twofold — the integrity attrs are present AND nothing fails
// integrity at load (entry mismatch would blank the page; a stylesheet mismatch
// would surface a console error). Code-split import() chunks are out of scope
// (no HTML tag to carry integrity — Phase 0 D3), documented in SECURITY.md.
test.describe('SRI: entry module + both stylesheets (Phase 3)', () => {
  for (const doc of SHELLS) {
    test(`${doc}: sha384 integrity present + nothing fails integrity`, async ({ page }) => {
      const sriErrors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && /integrity|digest|subresource/i.test(m.text())) {
          sriErrors.push(m.text());
        }
      });
      await page.goto(`/${doc}`, { waitUntil: 'load' });
      // Render proof for the entry module: a wrong entry digest blocks the
      // module, so a live render means its integrity is correct, not just present.
      if (doc === 'signin.html') {
        await expect(page.getByTestId('handle-input')).toBeVisible();
      } else {
        await expect(page.locator('#app')).toBeAttached();
      }
      await page.waitForTimeout(300);

      const attrs = await page.evaluate(() => {
        const entry = document.querySelector('script[type="module"][src]');
        const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
        return {
          entry: {
            integrity: entry?.getAttribute('integrity') ?? null,
            crossorigin: entry?.getAttribute('crossorigin') ?? null,
          },
          links: links.map((l) => ({
            href: l.getAttribute('href'),
            integrity: l.getAttribute('integrity'),
            crossorigin: l.getAttribute('crossorigin'),
          })),
        };
      });

      expect(attrs.entry.integrity, `${doc}: entry module integrity`).toMatch(/^sha384-/);
      expect(attrs.entry.crossorigin, `${doc}: entry module crossorigin`).toBe('anonymous');
      // Both stylesheets (styles + fonts) carry integrity.
      expect(attrs.links.length, `${doc}: at least two stylesheets`).toBeGreaterThanOrEqual(2);
      for (const l of attrs.links) {
        expect(l.integrity, `${doc}: stylesheet ${l.href} integrity`).toMatch(/^sha384-/);
        expect(l.crossorigin, `${doc}: stylesheet ${l.href} crossorigin`).toBe('anonymous');
      }
      // Nothing failed its integrity check at load (covers stylesheets too).
      expect(sriErrors, `${doc}: SRI errors: ${JSON.stringify(sriErrors)}`).toEqual([]);
    });
  }
});

// Phase 4: zero-third-party enforcement. A structural guard over the BUILT
// output — every <script src> must be same-origin (relative), and each
// document's CSP script-src must contain only 'self' + sha256 inline hashes,
// never a host allowlist, scheme, wildcard, or 'unsafe-*'. This is the guard
// that fails the moment a third-party script or a stray script-src host is
// introduced. It is green against today's output, so its RED proof is the
// deliberate third-party <script> injection recorded in the plan's Verification.
test.describe('Zero third-party scripts (Phase 4)', () => {
  const DOCS = [...SHELLS, 'friends.html'];
  for (const doc of DOCS) {
    test(`${doc}: every script is same-origin + script-src is self+hashes only`, () => {
      const html = readFileSync(`dist/${doc}`, 'utf8');

      // (1) Every <script src="…"> is same-origin (relative). No scheme, no //.
      const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]*)"/gi)].map((m) => m[1]);
      for (const src of srcs) {
        expect(src, `${doc}: script src "${src}" must be same-origin (relative)`).toMatch(/^\.?\//);
        expect(src, `${doc}: script src "${src}" must not be cross-origin`).not.toMatch(/^(https?:)?\/\//i);
      }

      // (2) CSP script-src = 'self' + only sha256 hashes.
      const csp = html.match(/Content-Security-Policy" content="([^"]*)"/i)?.[1] ?? '';
      const scriptSrc = csp
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('script-src '));
      expect(scriptSrc, `${doc}: has a script-src directive`).toBeTruthy();
      // import.html runs in-app OCR (Tesseract WASM), so it — and ONLY it — may
      // add 'wasm-unsafe-eval'. Everything else stays strict self+hashes.
      const isOcrPage = doc === 'import.html';
      const tokens = (scriptSrc ?? '').replace('script-src ', '').trim().split(/\s+/);
      for (const tok of tokens) {
        const ok =
          tok === "'self'" ||
          /^'sha256-[A-Za-z0-9+/=]+'$/.test(tok) ||
          (isOcrPage && tok === "'wasm-unsafe-eval'");
        expect(ok, `${doc}: script-src token "${tok}" must be 'self'/sha256${isOcrPage ? "/wasm-unsafe-eval" : ''}`).toBe(true);
      }
      expect(tokens, `${doc}: script-src includes 'self'`).toContain("'self'");
      if (isOcrPage) {
        // Relaxation is bounded: WASM compile only, never plain eval/inline/host.
        expect(tokens, `${doc}: allows wasm-unsafe-eval`).toContain("'wasm-unsafe-eval'");
        expect(scriptSrc, `${doc}: no plain unsafe-eval/inline/host/scheme/wildcard`).not.toMatch(
          /unsafe-inline|'unsafe-eval'|https?:|\*/i,
        );
      } else {
        expect(scriptSrc, `${doc}: script-src has no unsafe/host/scheme/wildcard`).not.toMatch(
          /unsafe-inline|unsafe-eval|wasm-unsafe-eval|https?:|\*/i,
        );
      }
    });
  }
});
