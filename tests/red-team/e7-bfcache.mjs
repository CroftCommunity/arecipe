// E7 (Chromium only) — with back/forward cache ENABLED (Playwright disables it
// by default), does a bfcached page keep a waiting worker from activating?
import { chromium } from 'playwright';
import { startServer, waitFor, report } from './harness.mjs';

const { state, origin, close } = await startServer();
const row = { engine: 'chromium' };
try {
  const browser = await chromium.launch({ ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  row.version = browser.version();
  const page = await browser.newPage();
  await page.goto(origin + '/');
  await waitFor(page, (s) => s.controller !== null);
  await page.reload();
  await waitFor(page, (s) => s.controllerVersion === 'v1');
  await page.evaluate(() => { window.addEventListener('pageshow', (e) => { window.__persisted = e.persisted; }); });
  state.sw['sw.js'] = 'v2';
  await page.evaluate(() => window.rt.reg.update());
  const s2 = await waitFor(page, (s) => s.waiting !== null);
  row.before_navigate = { controllerVersion: s2.controllerVersion, waiting: s2.waiting };
  await page.goto(origin + '/other.html'); // same-origin, controlled, eligible for bfcache
  await page.waitForTimeout(1500);
  await page.goBack();
  await page.waitForTimeout(500);
  row.after_goBack = {
    restoredFromBfcache: await page.evaluate(() => window.__persisted ?? null),
    navType: await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type ?? null),
    ...(await page.evaluate(() => window.rt.state())),
  };
  delete row.after_goBack.idb;
  await browser.close();
} catch (err) {
  row.error = String(err);
} finally {
  await close();
}
report('E7 bfcache vs waiting worker', [row]);
