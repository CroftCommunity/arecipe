// The self-hosted font stylesheet must reference its woff2 siblings correctly.
// fonts.css is served from /assets/fonts/, so a url() is resolved relative to
// that path — url(./assets/fonts/X.woff2) resolves to the doubled, 404'ing
// /assets/fonts/assets/fonts/X.woff2. This test resolves each url() exactly as
// the browser would and asserts the file exists (200), so a mis-pathed ref is a
// hard failure rather than a silent system-font fallback.
import { expect, test } from '@playwright/test';

test('fonts.css url() references resolve to real files (no doubled path)', async ({
  request,
  baseURL,
}) => {
  const cssRes = await request.get('/assets/fonts/fonts.css');
  expect(cssRes.status()).toBe(200);
  const css = await cssRes.text();

  const urls = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)]
    .map((m) => m[2])
    .filter((u): u is string => u !== undefined);
  expect(urls.length, 'fonts.css declares at least one @font-face src').toBeGreaterThan(0);

  for (const ref of urls) {
    // Resolve relative to the stylesheet's own URL, exactly as the browser does.
    const resolved = new URL(ref, `${baseURL}/assets/fonts/fonts.css`);
    const res = await request.get(resolved.pathname);
    expect(res.status(), `font ${ref} → ${resolved.pathname}`).toBe(200);
  }
});
