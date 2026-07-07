// D1 driver (throwaway): drives the loopback OAuth flow end-to-end with
// Playwright, then probes persistence, restore, forced refresh, multi-tab.
// Secrets come from the repo's gitignored .env and are never printed.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const env = Object.fromEntries(
  readFileSync('/Users/cpettet/git/chasemp/CroftC/arecipe/.env', 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const APP = 'http://127.0.0.1:8127';
const HANDLE = env.BSKY_TEST_HANDLE;
const report = {};
const log = (...a) => console.log('[d1]', ...a);

const describePage = async (page) => {
  const inputs = await page.locator('input:visible').evaluateAll((els) =>
    els.map((e) => ({ type: e.type, name: e.name, id: e.id, placeholder: e.placeholder, value: e.value ? '(filled)' : '' })));
  const buttons = await page.locator('button:visible, [role=button]:visible').evaluateAll((els) =>
    els.map((e) => e.textContent?.trim().slice(0, 40)));
  return { url: page.url().split('?')[0], inputs, buttons };
};

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.on('pageerror', (e) => log('pageerror:', String(e).slice(0, 200)));

await page.goto(APP);
report.initFirstLoad = await page.evaluate(() => window.d1.ready());
log('init on first load:', JSON.stringify(report.initFirstLoad));

await page.evaluate((h) => window.d1.signIn(h), HANDLE);
await page.waitForURL(/bsky\.social/, { timeout: 30_000 });
log('redirected to authz server');

// Walk the third-party pages: fill password when asked (once), authorize when
// asked. Never re-fill a filled/disabled field — Playwright's failure logs
// would dump the value.
const steps = [];
for (let i = 0; i < 15 && !page.url().startsWith(APP); i++) {
  await page.waitForTimeout(900);
  if (page.url().startsWith(APP)) break;
  const desc = await describePage(page).catch(() => ({ url: page.url().split('?')[0], inputs: [], buttons: [] }));
  steps.push(`${desc.url} | buttons: ${desc.buttons.join('/')}`);
  log(`step ${i}: ${steps[steps.length - 1]}`);
  const pwLoc = page.locator('input[type=password]:visible').first();
  const pwVisible = (await page.locator('input[type=password]:visible').count()) > 0;
  if (pwVisible) {
    const enabled = await pwLoc.isEnabled().catch(() => false);
    const already = await pwLoc.inputValue().catch(() => 'x');
    if (enabled && already === '') {
      const ident = page.locator('input[type=text]:visible, input[type=email]:visible').first();
      if ((await ident.count()) > 0 && (await ident.inputValue().catch(() => 'x')) === '') {
        await ident.fill(HANDLE, { timeout: 5_000 });
      }
      await pwLoc.fill(env.BSKY_TEST_PASSWORD, { timeout: 5_000 });
      await page.locator('button:has-text("Sign in"):visible, button[type=submit]:visible').first().click({ timeout: 5_000 });
      log('submitted credentials');
    } // else: mid-transition or already submitted — just loop
  } else {
    const authorize = page.locator(
      'button:has-text("Authorize"):visible, button:has-text("Accept"):visible, button:has-text("Allow"):visible, button:has-text("Continue"):visible',
    ).first();
    if ((await authorize.count()) > 0) {
      await authorize.click({ timeout: 5_000 }).catch(() => {});
      log('clicked consent button');
    } else if (desc.buttons.length > 0) {
      await page.screenshot({ path: 'step-unknown.png' });
      log('UNKNOWN PAGE with buttons — screenshot saved');
    } // else: blank/transition page — loop
  }
}
report.authSteps = steps;

await page.waitForURL((u) => String(u).startsWith(APP), { timeout: 30_000 });
report.initAfterCallback = await page.evaluate(() => window.d1.ready());
log('init after callback:', JSON.stringify(report.initAfterCallback));

report.authedRead = await page.evaluate(() => window.d1.read());
log('authenticated read:', JSON.stringify(report.authedRead));
report.tokenInfoInitial = await page.evaluate(() => window.d1.tokenInfo(false));
log('token info:', JSON.stringify(report.tokenInfoInitial));
report.sessionSurface = await page.evaluate(() => window.d1.sessionSurface());
report.idb = await page.evaluate(() => window.d1.dumpIdb());
log('idb:', JSON.stringify(report.idb));

// Reload → restore without login.
await page.reload();
report.initAfterReload = await page.evaluate(() => window.d1.ready());
log('init after reload:', JSON.stringify(report.initAfterReload));
report.readAfterReload = await page.evaluate(() => window.d1.read());

// Forced refresh.
report.tokenAfterForcedRefresh = await page.evaluate(() => window.d1.tokenInfo(true));
log('token after forced refresh:', JSON.stringify(report.tokenAfterForcedRefresh));

// Multi-tab: second tab restores, first tab forces another refresh, second reads.
const page2 = await context.newPage();
await page2.goto(APP);
report.tab2Init = await page2.evaluate(() => window.d1.ready());
report.tab1SecondForcedRefresh = await page.evaluate(() => window.d1.tokenInfo(true));
await page.waitForTimeout(1500);
report.tab2ReadAfterTab1Refresh = await page2.evaluate(() => window.d1.read());
report.tab2Events = await page2.evaluate(() => window.d1.state.events);
report.tab1Events = await page.evaluate(() => window.d1.state.events);
log('multi-tab:', JSON.stringify({ init: report.tab2Init, read: report.tab2ReadAfterTab1Refresh, tab1Events: report.tab1Events, tab2Events: report.tab2Events }));

console.log('=== REPORT ===');
console.log(JSON.stringify(report, null, 1));
await browser.close();
