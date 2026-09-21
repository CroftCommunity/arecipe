// E6 — against the REAL built app (dist/ from `npm run build`, unsigned is
// fine: no path here touches the manifest). Two domain-only sequences with the
// good worker untouched throughout:
//   (a) the origin swaps index.html; sw-nav's "background revalidate" writes
//       the network copy into the good worker's cache; the NEXT launch serves it.
//   (b) any same-origin page writes a foreign cache; the worker's global
//       caches.match() serves it for a not-yet-cached hashed chunk.
// (Assumption 7; the plan's "Today" column says a worker replacement comes first.)
import http from 'node:http';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { ENGINES, report } from './harness.mjs';

const DIST = new URL('../../dist/', import.meta.url).pathname;
if (!existsSync(join(DIST, 'sw.js'))) throw new Error('run `npm run build` first');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const heavyChunk = (() => {
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const precached = new Set([...sw.matchAll(/"\.\/(chunk-[A-Z0-9]+\.js)"/g)].map((m) => m[1]));
  const all = [...readFileSync(join(DIST, 'build-info.json'), 'utf8').matchAll(/chunk-[A-Z0-9]+\.js/g)].map((m) => m[0]);
  const info = JSON.parse(readFileSync(join(DIST, 'release-manifest.json'), 'utf8'));
  return Object.keys(info.files).find((f) => /^chunk-[A-Z0-9]+\.js$/.test(f) && !precached.has(f)) ?? all[0];
})();

const serve = async (root) => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(root, p);
    if (!existsSync(file)) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
};

const ATTACKER_HTML = `<!doctype html><meta charset="utf-8"><title>PWNED</title><h1 id="pwned">attacker shell, served by the GOOD worker</h1><script>window.__pwned = 'domain-only; worker untouched';</script>`;

const rows = [];
for (const [name, engine] of Object.entries(ENGINES)) {
  const root = mkdtempSync(join(tmpdir(), `rt-e6-${name}-`));
  cpSync(DIST, root, { recursive: true });
  const { origin, close } = await serve(root);
  const row = { engine: name, heavyChunk };
  try {
    const browser = await engine.launch();
    row.version = browser.version();
    const page = await browser.newPage();
    await page.goto(origin + '/');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null || document.readyState === 'complete');
    // Ensure the install finished and a controller exists.
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    const controller = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL.split('/').pop());
    row.step1 = { title: await page.title(), controller };
    // (a) origin swaps index.html — no worker change.
    writeFileSync(join(root, 'index.html'), ATTACKER_HTML);
    await page.reload(); // served from cache; background revalidate stores the network copy
    await page.waitForTimeout(1500);
    row.step2_first_reload = { title: await page.title() };
    await page.reload();
    await page.waitForTimeout(500);
    row.step3_second_reload = {
      title: await page.title(),
      pwned: await page.evaluate(() => window.__pwned ?? null),
      controller: await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.split('/').pop() ?? null),
      caches: await page.evaluate(() => caches.keys()),
      regs: await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    };
    // (b) any same-origin page poisons a foreign cache; the worker serves it.
    row.step4_foreign_cache = await page.evaluate(async (chunk) => {
      await (await caches.open('evil')).put(new Request('./' + chunk), new Response('window.__chunkPwned=1;', { headers: { 'content-type': 'application/javascript' } }));
      const body = await (await fetch('./' + chunk)).text();
      return { servedBodyHead: body.slice(0, 40), controller: navigator.serviceWorker.controller?.scriptURL.split('/').pop() ?? null };
    }, heavyChunk);
    // (c) persistence through a SECURITY feature: the version pin (D4, #107)
    // routes every navigation to `arecipe-<lockedVersion>`; lockedVersion is a
    // page-writable IDB value and shouldDeleteCache() keeps that cache forever.
    row.step5_pin_persistence = await page.evaluate(async () => {
      await (await caches.open('arecipe-evil')).put(new Request('./index.html'), new Response('<!doctype html><title>PINNED-PWNED</title><script>window.__pinned=1;</script>', { headers: { 'content-type': 'text/html' } }));
      await new Promise((res, rej) => {
        const q = indexedDB.open('arecipe-release', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('config');
        q.onsuccess = () => { const tx = q.result.transaction('config', 'readwrite'); tx.objectStore('config').put({ requireVerified: true, lockedVersion: 'evil' }, 'v1'); tx.oncomplete = () => { q.result.close(); res(); }; tx.onerror = rej; };
        q.onerror = rej;
      });
      navigator.serviceWorker.controller?.postMessage({ type: 'ARECIPE_RELEASE_CONFIG_CHANGED' });
      return 'written';
    });
    await page.waitForTimeout(300);
    await page.goto(origin + '/account.html'); // a different known document
    await page.waitForTimeout(500);
    row.step5_pin_persistence = {
      title: await page.title(),
      pinned: await page.evaluate(() => window.__pinned ?? null),
      controller: await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.split('/').pop() ?? null),
    };
    await browser.close();
  } catch (err) {
    row.error = String(err);
  } finally {
    await close();
    rmSync(root, { recursive: true, force: true });
  }
  rows.push(row);
}
report('E6 real dist: revalidate + foreign-cache poisoning with the good worker intact', rows);
