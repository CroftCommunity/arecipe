// Dedicated sign-in page (plans/2026-07-08-2-plan-dedicated-signin-page.md),
// now carrying the workspace sign-in pattern — croft-pwa/docs/DESIGN.md
// § Flows › Sign in and § Copy. The PAGE container stays (a legitimate variant;
// the sheet is the exception to "pages, not modals", not a mandate); the content
// is the pattern: a probed provider registry, two panels split by posture,
// Create only where signups are open, the handle seam, the atmo copy.
//
// Hermetic: cross-origin is blocked except the discovery a provider tap
// triggers, which is answered from REAL documents harvested from eurosky.social
// (tests/fixtures/atproto/oauth-*.eurosky.json) with the issuer rewritten per
// entryway. The PAR body is captured — that is what proves "Create account" is
// an intent and not a second button with different words. The interactive
// consent round-trip stays in the @live tier.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ATMO_GLOSS, PROVIDERS, featuredProviders, otherProviders } from '../../src/auth/providers.js';

const OPEN = featuredProviders();
const INVITE = otherProviders();
const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');

const rows = (page: Page, within: string) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} [data-provider-row]`)].map((r) => ({
        id: r.getAttribute('data-provider-row'),
        create: r.querySelector('[data-provider-create]') !== null,
        signin: r.querySelector('[data-provider-signin]') !== null,
        visible: r.getClientRects().length > 0,
        text: (r as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
      })),
    within,
  );

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === 'localhost' || host === '127.0.0.1') void route.continue();
    else void route.abort();
  });
});

test('the registry carries both postures, or this spec proves nothing', () => {
  expect(OPEN.length).toBeGreaterThan(0);
  expect(INVITE.length).toBeGreaterThan(0);
});

test('signin.html is a real document asking for an atmo provider, glossed and explained', async ({ page }) => {
  await page.goto('/signin.html');
  await expect(page).toHaveTitle(/sign in/i);
  const h = page.getByRole('heading', { level: 2 });
  await expect(h).toHaveText('Choose your atmo provider');
  await expect(h.locator('abbr')).toHaveAttribute('title', ATMO_GLOSS);
  // Touch cannot hover, so the definition is visible without the tooltip.
  await expect(page.getByTestId('signin-intro')).toContainText('Personal Data Server');
});

test('front page = open providers with Create + Sign in; invite-only behind Another provider', async ({ page }) => {
  await page.goto('/signin.html');
  const front = await rows(page, '[data-signin-front]');
  expect(front.map((r) => r.id)).toEqual(OPEN.map((p) => p.id));
  for (const r of front) expect(r.visible && r.create && r.signin, JSON.stringify(r)).toBe(true);
  for (const p of INVITE) expect(front.some((r) => r.id === p.id)).toBe(false);

  const before = await rows(page, '[data-signin-other]');
  expect(before.map((r) => r.id)).toEqual(INVITE.map((p) => p.id));
  expect(before.every((r) => !r.visible)).toBe(true);

  await page.getByTestId('provider-other').click();
  await expect(page.getByTestId('provider-other')).toBeHidden();
  const other = await rows(page, '[data-signin-other]');
  for (const r of other) {
    expect(r.visible).toBe(true);
    expect(r.create, `${r.id} is invite-only — a Create would land on a screen demanding a code`).toBe(false);
    expect(r.signin).toBe(true);
    expect(r.text).toMatch(/invite only/i);
  }
  await expect(page.getByTestId('handle-input')).toBeFocused();
});

test('fits the narrowest phone: no sideways scroll at 320px and every control ≥44px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/signin.html');
  await page.getByTestId('provider-other').click();
  const fit = await page.evaluate(() => {
    const root = document.querySelector('[data-signin-page]') as HTMLElement;
    const small = [...root.querySelectorAll('button, input')]
      .map((b) => {
        const r = b.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return r.width < 44 || r.height < 44
          ? `${(b as HTMLElement).innerText || b.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`
          : null;
      })
      .filter(Boolean);
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small };
  });
  expect(fit.overflow).toBeLessThanOrEqual(1);
  expect(fit.small).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`a11y: signin with the other panel revealed (${theme}) — no serious/critical violations`, async ({ page }) => {
    await page.addInitScript((t) => {
      try {
        if (t === 'dark') localStorage.setItem('theme', 'dark');
      } catch {
        /* private mode */
      }
    }, theme);
    await page.goto('/signin.html');
    await page.getByTestId('provider-other').click();
    await page.locator('footer').first().waitFor();
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact ?? '?'}) × ${v.nodes.length}`);
    expect(blocking, blocking.join(' · ')).toEqual([]);
  });
}

// Discovery for the chosen entryway, answered from harvested documents. Each
// registered provider is its own authorization server (probed 2026-08-29; the
// live spec re-checks), so the whole chain stays at the entryway origin.
async function mockProvider(page: Page, entryway: string): Promise<{ par: () => URLSearchParams[] }> {
  const bodies: URLSearchParams[] = [];
  const meta = JSON.parse(fixture('oauth-authorization-server.eurosky.json')) as Record<string, unknown>;
  const rewritten = JSON.parse(JSON.stringify(meta).split('https://eurosky.social').join(entryway)) as Record<string, unknown>;
  await page.route(`${entryway}/.well-known/oauth-protected-resource`, (route) =>
    route.fulfill({ json: JSON.parse(fixture('oauth-protected-resource.eurosky.json').split('https://eurosky.social').join(entryway)) }),
  );
  await page.route(`${entryway}/.well-known/oauth-authorization-server`, (route) => route.fulfill({ json: rewritten }));
  await page.route(`${entryway}/oauth/par`, (route) => {
    bodies.push(new URLSearchParams(route.request().postData() ?? ''));
    return route.fulfill({ status: 201, json: { request_uri: 'urn:ietf:params:oauth:request_uri:e2e', expires_in: 60 } });
  });
  // The authorize hop would leave the origin; hold it so the test can read state.
  await page.route(`${entryway}/oauth/authorize**`, (route) => route.fulfill({ status: 200, body: 'held' }));
  return { par: () => bodies };
}

test('Create account starts OAuth at that provider in the CREATE intent; Sign in sends no prompt', async ({ page }) => {
  const p = OPEN[0];
  if (p === undefined) throw new Error('no open provider');
  const { par } = await mockProvider(page, p.entryway);
  await page.goto('/signin.html');
  await page.locator(`[data-provider-row="${p.id}"] [data-provider-create]`).click();
  await page.waitForURL(`${p.entryway}/oauth/authorize**`);
  expect(par()).toHaveLength(1);
  expect(par()[0]?.get('prompt')).toBe('create');
  expect(par()[0]?.has('login_hint')).toBe(false);

  await page.goto('/signin.html');
  await page.locator(`[data-provider-row="${p.id}"] [data-provider-signin]`).click();
  await page.waitForURL(`${p.entryway}/oauth/authorize**`);
  expect(par()).toHaveLength(2);
  expect(par()[1]?.has('prompt')).toBe(false);
});

for (const p of INVITE) {
  test(`${p.id}: Sign in on the other panel reaches PAR at ${p.entryway}`, async ({ page }) => {
    const { par } = await mockProvider(page, p.entryway);
    await page.goto('/signin.html');
    await page.getByTestId('provider-other').click();
    await page.locator(`[data-provider-row="${p.id}"] [data-provider-signin]`).click();
    await page.waitForURL(`${p.entryway}/oauth/authorize**`);
    expect(par()).toHaveLength(1);
    expect(par()[0]?.has('prompt')).toBe(false);
  });
}

test('a handle on any other provider reaches the same seam, leading @ stripped', async ({ page }) => {
  const seen: string[] = [];
  await page.route('**/xrpc/com.atproto.identity.resolveHandle*', (route) => {
    seen.push(new URL(route.request().url()).searchParams.get('handle') ?? '');
    return route.fulfill({ status: 400, json: { error: 'InvalidRequest', message: 'Unable to resolve handle' } });
  });
  await page.goto('/signin.html');
  await page.getByTestId('provider-other').click();
  await page.getByTestId('handle-input').fill('@someone.zio.blue');
  await page.getByTestId('oauth-signin').click();
  await expect(page.getByTestId('signin-status')).toContainText(/sign-in failed/i);
  expect(seen).toEqual(['someone.zio.blue']);
});

test('the four probed providers are in the registry', () => {
  expect(PROVIDERS.map((p) => p.id).sort()).toEqual(['blacksky', 'bsky', 'eurosky', 'northsky']);
});
