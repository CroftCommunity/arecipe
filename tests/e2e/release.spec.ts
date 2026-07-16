// Signed releases Phase 5: page-observable wiring against the BUILT bundle.
// The e2e dist is signed with the committed fixture key (build:e2e), so
// "verified" is a real end-to-end state; the bad states are produced by
// routing the PAGE-level manifest fetch (Playwright cannot route SW-initiated
// fetches — the SW's own verdict/routing logic is unit-tested pure, plan F2).
// The production-origin banner is exercised by serving the dist THROUGH
// routes at https://arecipe.app, which the origin classifier reads as
// production; the same bad manifest on loopback must NOT banner.
import { createPrivateKey, sign as nodeSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { canonicalManifestBytes, type ReleaseManifest } from '../../src/release/manifest.js';

const DIST = new URL('../../dist/', import.meta.url).pathname;
const distManifest = (): ReleaseManifest =>
  JSON.parse(readFileSync(join(DIST, 'release-manifest.json'), 'utf8')) as ReleaseManifest;

const SEED = Buffer.from(
  readFileSync(new URL('../fixtures/release/signing-seed.b64', import.meta.url), 'utf8').trim(),
  'base64',
);
const signManifest = (m: Omit<ReleaseManifest, 'sig'>): ReleaseManifest => {
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), SEED]);
  const key = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  return { ...m, sig: nodeSign(null, canonicalManifestBytes(m), key).toString('base64') };
};

/** Route the page-level manifest fetch (same-origin, page-initiated). */
const routeManifest = (page: Page, origin: string, body: string, status = 200) =>
  page.route(`${origin}/release-manifest.json`, (route) =>
    route.fulfill({ status, contentType: 'application/json', body }),
  );

const tamperedManifest = (): string => {
  const m = distManifest();
  const [path, hash] = Object.entries(m.files)[0]!;
  m.files[path] = `${hash.slice(0, -1)}${hash.endsWith('0') ? '1' : '0'}`;
  return JSON.stringify(m);
};

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html',
  js: 'text/javascript',
  css: 'text/css',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  png: 'image/png',
  woff2: 'font/woff2',
};

/** Serve the built dist through routes at a foreign origin (no real server
 * there) — how the production-origin classifier is exercised hermetically. */
const serveDistAt = (page: Page, origin: string) =>
  page.route(`${origin}/**`, (route) => {
    const url = new URL(route.request().url());
    let path = decodeURIComponent(url.pathname).replace(/^\//, '');
    if (path === '' || path.endsWith('/')) path += 'index.html';
    try {
      const body = readFileSync(join(DIST, path));
      const ext = path.split('.').pop() ?? '';
      return route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
        body,
      });
    } catch {
      return route.fulfill({ status: 404, body: 'not found' });
    }
  });

const waitForController = (page: Page) =>
  page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 20_000,
  });

test.describe('Release & version panel (acceptance 2)', () => {
  test('the fixture-signed dist reads VERIFIED, names the interim key, shows running version', async ({
    page,
  }) => {
    await page.goto('/account.html');
    const state = page.getByTestId('release-state');
    await expect(state).toContainText(/verified/i, { timeout: 15_000 });
    await expect(state).toContainText(/interim/i);
    await expect(state).toContainText(/signature/i);
    // Build facts migrated from Settings keep their testid.
    await expect(page.getByTestId('build-facts')).toContainText(/version/i);
    await expect(page.getByTestId('release-local-note')).toContainText(/this install only/i);
  });

  test('a TAMPERED manifest reads invalid; sig:null reads unsigned; 404 reads couldn’t-check', async ({
    page,
  }) => {
    const origin = 'http://127.0.0.1:4173';
    await routeManifest(page, origin, tamperedManifest());
    await page.goto('/account.html');
    await expect(page.getByTestId('release-state')).toContainText(/failed/i, { timeout: 15_000 });
    await expect(page.getByTestId('release-state')).toContainText(/bad-signature/);

    await page.unroute(`${origin}/release-manifest.json`);
    await routeManifest(page, origin, JSON.stringify({ ...distManifest(), sig: null, pubkeyFingerprint: null }));
    await page.goto('/account.html');
    await expect(page.getByTestId('release-state')).toContainText(/unsigned/i, { timeout: 15_000 });

    await page.unroute(`${origin}/release-manifest.json`);
    await routeManifest(page, origin, 'gone', 404);
    await page.goto('/account.html');
    await expect(page.getByTestId('release-state')).toContainText(/couldn.t check/i, {
      timeout: 15_000,
    });
  });

  test('a RACING DEPLOY (valid manifest, newer build) reads quiet and never banners (acceptance 6)', async ({
    page,
  }) => {
    // Prime the SW so the page knows its running version (identity check).
    await page.goto('/account.html');
    await waitForController(page);
    const raced = signManifest({
      buildNumber: 9_999_999,
      version: '2099.01.01-raced99',
      builtAt: '2099-01-01T00:00:00.000Z',
      files: distManifest().files,
      pubkeyFingerprint: distManifest().pubkeyFingerprint,
    });
    await routeManifest(page, 'http://127.0.0.1:4173', JSON.stringify(raced));
    await page.goto('/account.html');
    await expect(page.getByTestId('release-state')).toContainText(/newer deploy|raced/i, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('release-banner')).toHaveCount(0);
    // Running version stays this install's own, not the raced one.
    await expect(page.getByTestId('release-running')).not.toContainText('2099.01.01-raced99');
  });
});

test.describe('version pin (acceptance 4)', () => {
  test('pin → locked text everywhere it must appear; manual check inert; stamp locked; unpin restores', async ({
    page,
  }) => {
    await page.goto('/account.html');
    await waitForController(page);
    // The panel resolved its running meta at mount, possibly pre-claim —
    // remount now that the SW controls the page.
    await page.reload();
    await expect(page.getByTestId('release-running')).toContainText('(build #', {
      timeout: 15_000,
    });
    const runningText = await page.getByTestId('release-running').textContent();
    const version = /v(\S+) \(build/.exec(runningText ?? '')?.[1];
    expect(version, `running line parses: ${runningText}`).toBeTruthy();

    // Pin. The status renders the ruled copy; the config is device-local.
    await page.getByTestId('version-pin').locator('input').check();
    await expect(page.getByTestId('pin-status')).toHaveText(`version locked at v${version}`);

    // Manual check is INERT while pinned: locked text, no update language.
    await page.getByTestId('check-updates').click();
    await expect(page.getByTestId('update-status')).toContainText(`version locked at v${version}`);
    await expect(page.getByTestId('update-status')).not.toContainText(/update found|latest build/);

    // The footer stamp shows the RUNNING (locked) version, not network
    // build-info — proven across a reload (config persisted in IDB).
    await page.reload();
    await expect(page.getByTestId('build-stamp')).toHaveText(`v${version} · version locked`, {
      timeout: 15_000,
    });
    // Still pinned after reload; no toast anywhere.
    await expect(page.getByTestId('version-pin').locator('input')).toBeChecked();
    await expect(page.getByTestId('update-toast')).toHaveCount(0);

    // Unpin → the normal flow resumes.
    await page.getByTestId('version-pin').locator('input').uncheck();
    await expect(page.getByTestId('pin-status')).toHaveText('');
    await page.getByTestId('check-updates').click();
    await expect(page.getByTestId('update-status')).toContainText(/latest build|update found/, {
      timeout: 15_000,
    });
    await page.reload();
    await expect(page.getByTestId('build-stamp')).toHaveText(/ KB \(.+ KB gz\)$/, {
      timeout: 15_000,
    });
  });

  test('install-only-verified is ON by default and its choice persists on this device', async ({
    page,
  }) => {
    await page.goto('/account.html');
    const toggle = page.getByTestId('require-verified').locator('input');
    await expect(toggle).toBeChecked({ timeout: 15_000 });
    await toggle.uncheck();
    await page.reload();
    await expect(page.getByTestId('require-verified').locator('input')).not.toBeChecked({
      timeout: 15_000,
    });
  });
});

test.describe('release banner (acceptance 1 + 2)', () => {
  const PROD = 'https://arecipe.app';

  test('a tampered manifest banners on the PRODUCTION origin; dismiss holds for the session', async ({
    page,
  }) => {
    await serveDistAt(page, PROD);
    await routeManifest(page, PROD, tamperedManifest());
    await page.goto(`${PROD}/index.html`);
    const banner = page.getByTestId('release-banner');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText(/couldn.t be verified/i);
    await expect(banner).toContainText(/bad-signature/);
    // Dismiss → gone, and stays gone across a navigation this session.
    await page.getByTestId('release-banner-dismiss').click();
    await expect(banner).toHaveCount(0);
    await page.goto(`${PROD}/settings.html`);
    await expect(page.getByTestId('release-pointer')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('release-banner')).toHaveCount(0);
  });

  test('an UNSIGNED build banners on production — and the SAME state on loopback only logs', async ({
    page,
  }) => {
    const unsigned = JSON.stringify({ ...distManifest(), sig: null, pubkeyFingerprint: null });
    await serveDistAt(page, PROD);
    await routeManifest(page, PROD, unsigned);
    await page.goto(`${PROD}/index.html`);
    await expect(page.getByTestId('release-banner')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('release-banner')).toContainText(/unsigned/i);

    // Loopback (the dev/e2e origin): same unsigned manifest — log, no banner.
    const logs: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('[arecipe]')) logs.push(msg.text());
    });
    await routeManifest(page, 'http://127.0.0.1:4173', unsigned);
    await page.goto('/?debug=1');
    await expect(page.locator('h1')).toHaveText('arecipe', { timeout: 15_000 });
    await page.waitForTimeout(1_000);
    await expect(page.getByTestId('release-banner')).toHaveCount(0);
    expect(logs.join('\n')).toMatch(/release check: unsigned .*expected off production/);
  });

  test('the fixture-signed dist does NOT banner on the production origin (verified is quiet)', async ({
    page,
  }) => {
    await serveDistAt(page, PROD);
    await page.goto(`${PROD}/index.html`);
    await expect(page.locator('h1')).toHaveText('arecipe', { timeout: 15_000 });
    await page.waitForTimeout(1_000);
    await expect(page.getByTestId('release-banner')).toHaveCount(0);
  });
});
