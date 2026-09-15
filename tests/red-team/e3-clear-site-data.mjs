// E3 — can a response header from the ORIGIN (no key, no page code) remove
// the registration, caches and IDB from under a controlled page? Three
// deliveries: (a) a page fetch() the worker does not intercept, (b) a fetch
// the WORKER itself makes, (c) the worker-script update response. (Assumption
// 5/8; the plan's "offline launches cannot change the registration" sibling.)
import { ENGINES, startServer, waitFor, report } from './harness.mjs';

const CSD = { 'clear-site-data': '"storage"' };
const rows = [];
for (const [name, engine] of Object.entries(ENGINES)) {
  for (const delivery of ['page-fetch', 'worker-fetch', 'sw-script-update']) {
    const { state, origin, close } = await startServer();
    const row = { engine: name, delivery };
    try {
      const browser = await engine.launch();
      row.version = browser.version();
      const page = await browser.newPage();
      await page.goto(origin + '/');
      await waitFor(page, (s) => s.controller !== null);
      await page.reload();
      const before = await waitFor(page, (s) => s.controllerVersion === 'v1');
      await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('rt-idb'); q.onsuccess = () => { q.result.close(); r(); }; q.onerror = r; }));
      row.before = { registrations: before.registrations, caches: before.caches };
      if (delivery === 'page-fetch') {
        state.headers['/data.json'] = CSD;
        row.fetch = await page.evaluate(() => fetch('/data.json', { cache: 'reload' }).then((r) => r.status));
      } else if (delivery === 'worker-fetch') {
        state.headers['/data.json'] = CSD;
        row.fetch = await page.evaluate(() => window.rt.askController({ type: 'fetch', url: '/data.json' }));
      } else {
        state.headers['/sw.js'] = CSD; // same bytes → no install, but the response is a network response
        row.update = await page.evaluate(() => Promise.race([
          window.rt.reg.update().then(() => 'resolved', (e) => 'rejected:' + String(e)),
          new Promise((r) => setTimeout(() => r('update() never settled within 8s'), 8000)),
        ]));
      }
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => Promise.race([
        window.rt.state(),
        new Promise((r) => setTimeout(() => r({ registrations: 'state() timed out', caches: null, idb: null, controller: null }), 8000)),
      ]));
      row.after = { registrations: after.registrations, caches: after.caches, idb: after.idb, controller: after.controller };
      row.swFetchesSeen = state.log.filter((l) => l.path === '/sw.js').map((l) => l.swHeader);
      await browser.close();
    } catch (err) {
      row.error = String(err);
    } finally {
      await close();
    }
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
report('E3 Clear-Site-Data: "storage" from the origin', rows);
