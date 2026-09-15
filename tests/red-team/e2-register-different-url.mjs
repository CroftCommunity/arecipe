// E2 — register() with a DIFFERENT script URL on the same scope (plan D1's
// migration): is it an update of the same registration, does updatefound fire,
// does the old worker keep controlling until skipWaiting? (Assumption 3.)
import { ENGINES, startServer, waitFor, report } from './harness.mjs';

const rows = [];
for (const [name, engine] of Object.entries(ENGINES)) {
  const { origin, close } = await startServer();
  const row = { engine: name };
  try {
    const browser = await engine.launch();
    row.version = browser.version();
    const page = await browser.newPage();
    await page.goto(origin + '/?sw=sw-a.js');
    await waitFor(page, (s) => s.controller !== null);
    await page.reload();
    await waitFor(page, (s) => s.controllerVersion === 'a1');
    const scope = await page.evaluate(() => window.rt.register('./sw-b.js'));
    row.register_b_scope = new URL(scope).pathname;
    const s = await waitFor(page, (x) => x.waiting !== null || x.TIMEOUT);
    row.after_register_b = { controller: s.controller, controllerVersion: s.controllerVersion, installing: s.installing, waiting: s.waiting, active: s.active, registrations: s.registrations, events: s.events };
    // Same-URL, same-bytes re-register: must be a no-op (no updatefound).
    await page.evaluate(() => window.rt.register('./sw-b.js'));
    await page.waitForTimeout(800);
    const s2 = await page.evaluate(() => window.rt.state());
    row.rereg_same_url_events = s2.events;
    await page.evaluate(() => window.rt.askWaiting({ type: 'skipWaiting' }));
    const s3 = await waitFor(page, (x) => x.controllerVersion === 'b1' || x.TIMEOUT);
    row.after_skipWaiting = { controllerVersion: s3.controllerVersion, active: s3.active, events: s3.events };
    await browser.close();
  } catch (err) {
    row.error = String(err);
  } finally {
    await close();
  }
  rows.push(row);
}
report('E2 register() with a different script URL', rows);
