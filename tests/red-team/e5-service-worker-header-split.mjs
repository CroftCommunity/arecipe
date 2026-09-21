// E5 — the browser's worker-script fetch carries `Service-Worker: script`
// (spec, Update algorithm). Can the origin serve DIFFERENT bytes to that fetch
// than to the page's own fetch() of the same URL, so that "the page hashes the
// newcomer" (plan D3) verifies bytes the browser never installed? (Assumption 4/6.)
import { ENGINES, startServer, waitFor, report } from './harness.mjs';

const rows = [];
for (const [name, engine] of Object.entries(ENGINES)) {
  const { state, origin, close } = await startServer();
  const row = { engine: name };
  try {
    const browser = await engine.launch();
    row.version = browser.version();
    const page = await browser.newPage();
    await page.goto(origin + '/');
    await waitFor(page, (s) => s.controller !== null);
    await page.reload();
    await waitFor(page, (s) => s.controllerVersion === 'v1');
    state.hostileForSwHeader = 'HOSTILE';
    // The page re-fetches the worker URL to "hash" it — sees the good bytes.
    row.page_fetch_sees = await page.evaluate(() => fetch('/sw.js', { cache: 'reload' }).then((r) => r.text()).then((t) => t.split('\n')[0]));
    await page.evaluate(() => window.rt.reg.update());
    const s = await waitFor(page, (x) => x.waiting !== null || x.TIMEOUT);
    row.browser_installed = { waiting: s.waiting, waitingVersion: await page.evaluate(() => window.rt.askWaiting({ type: 'version' })), events: s.events };
    row.sw_script_requests = state.log.filter((l) => l.path === '/sw.js').map((l) => ({ swHeader: l.swHeader, cache: l.cache }));
    await browser.close();
  } catch (err) {
    row.error = String(err);
  } finally {
    await close();
  }
  rows.push(row);
}
report('E5 Service-Worker: script header lets the origin split bytes', rows);
