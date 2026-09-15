// E4 — a page at an UNKNOWN in-scope path (the production worker passes such
// navigations to the network — sw-nav.ts) runs with the origin's full storage
// authority: can it enumerate and unregister the ROOT registration and wipe
// the caches + IDB? (Assumptions 7, 8; the PR-preview co-hosting rule.)
import { ENGINES, startServer, waitFor, report } from './harness.mjs';

const rows = [];
for (const [name, engine] of Object.entries(ENGINES)) {
  const { origin, close } = await startServer();
  const row = { engine: name };
  try {
    const browser = await engine.launch();
    row.version = browser.version();
    const page = await browser.newPage();
    await page.goto(origin + '/');
    await waitFor(page, (s) => s.controller !== null);
    await page.reload();
    await waitFor(page, (s) => s.controllerVersion === 'v1');
    // A "foreign" co-hosted path: the harness worker does not intercept it, so
    // the network (the domain) serves it — exactly sw-nav.ts's unknown-path rule.
    await page.goto(origin + '/pr-preview/pr-999/index.html?sw=none');
    row.foreign_page = await page.evaluate(async () => ({
      servedBy: window.__servedBy,
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      regs: (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname),
      caches: await caches.keys(),
    }));
    row.wipe = await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      const unreg = await Promise.all(regs.map((r) => r.unregister()));
      const keys = await caches.keys();
      const del = await Promise.all(keys.map((k) => caches.delete(k)));
      return { unregistered: unreg, cachesDeleted: del };
    });
    await page.goto(origin + '/');
    const after = await page.evaluate(async () => ({
      servedBy: window.__servedBy,
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      regsBeforeReregister: (await navigator.serviceWorker.getRegistrations()).length,
    }));
    row.next_launch = after;
    await browser.close();
  } catch (err) {
    row.error = String(err);
  } finally {
    await close();
  }
  rows.push(row);
}
report('E4 an in-scope unknown-path page unregisters the root worker', rows);
