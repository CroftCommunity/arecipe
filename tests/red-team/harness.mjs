// Red-team experiment harness (2026-09-14). NOT part of the gate; run by hand:
//   node tests/red-team/<experiment>.mjs
// A tiny origin (127.0.0.1) that serves a page + a service worker whose bytes
// and response headers the experiment can mutate mid-run, so browser-side
// lifecycle behaviour can be observed from the page. Engines come from the
// repo's pinned @playwright/test (playwright-core under node_modules).
import http from 'node:http';
import { chromium, firefox, webkit } from 'playwright';

export const ENGINES = { chromium, firefox, webkit };

const PAGE = (servedBy) => `<!doctype html><meta charset="utf-8"><title>rt</title>
<p id="served">served-by:${servedBy}</p>
<script>
window.__servedBy = ${JSON.stringify(servedBy)};
window.__events = [];
const params = new URLSearchParams(location.search);
const swUrl = params.get('sw') || './sw.js';
const rt = (window.rt = {});
navigator.serviceWorker.addEventListener('controllerchange', () => window.__events.push('controllerchange'));
rt.ready = (async () => {
  const reg = await navigator.serviceWorker.register(swUrl);
  rt.reg = reg;
  reg.addEventListener('updatefound', () =>
    window.__events.push('updatefound:' + (reg.installing ? reg.installing.scriptURL.split('/').pop() : '?')));
  return reg;
})();
const ask = (w, msg) => new Promise((res) => {
  if (!w) return res(null);
  const ch = new MessageChannel();
  const t = setTimeout(() => res('timeout'), 3000);
  ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data); };
  w.postMessage(msg, [ch.port2]);
});
rt.askController = (msg) => ask(navigator.serviceWorker.controller, msg);
rt.askWaiting = (msg) => ask(rt.reg && rt.reg.waiting, msg);
rt.register = (url) => navigator.serviceWorker.register(url).then((r) => { rt.reg = r; return r.scope; });
// Beacon mode (phones without a DevTools socket): the page reports its own
// state to the origin, and ?update=1 makes it call reg.update() itself.
if (params.get('beacon') === '1') {
  const post = async () => { try { await fetch('/report', { method: 'POST', body: JSON.stringify(await rt.state()) }); } catch {} };
  rt.ready.then(() => { setTimeout(post, 1500); setInterval(post, 2000); });
  if (params.get('update') === '1') rt.ready.then((reg) => setTimeout(() => reg.update(), 3000));
}
rt.state = async () => {
  await rt.ready.catch(() => {});
  const regs = await navigator.serviceWorker.getRegistrations();
  const short = (w) => (w ? w.scriptURL.split('/').pop() + ':' + w.state : null);
  let idb = null;
  try { idb = (await indexedDB.databases()).map((d) => d.name); } catch { idb = 'n/a'; }
  return {
    servedBy: window.__servedBy,
    controller: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL.split('/').pop() : null,
    controllerVersion: await rt.askController({ type: 'version' }),
    installing: short(rt.reg && rt.reg.installing),
    waiting: short(rt.reg && rt.reg.waiting),
    active: short(rt.reg && rt.reg.active),
    registrations: regs.map((r) => new URL(r.scope).pathname),
    caches: await caches.keys(),
    idb,
    events: window.__events.slice(),
  };
};
</script>`;

const SW = (version, name) => `// ${name} ${version}
const VERSION = ${JSON.stringify(version)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('rt-' + VERSION).then((c) => c.put('/marker', new Response(VERSION))));
});
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('message', (e) => {
  const d = e.data || {};
  const reply = (v) => e.ports[0] && e.ports[0].postMessage(v);
  if (d.type === 'version') return reply(VERSION);
  if (d.type === 'skipWaiting') { self.skipWaiting(); return reply('ok'); }
  if (d.type === 'fetch') return fetch(d.url, { cache: 'reload' }).then((r) => reply(r.status), (err) => reply('err:' + err));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    // Stamp the shell with the worker that served it — observable before any
    // page code runs, so a restart test can see which worker handled the launch.
    e.respondWith(fetch(e.request).then((r) => r.text()).then((t) =>
      new Response(t.replace('served-by:network', 'served-by:' + VERSION).replace('"network"', JSON.stringify(VERSION)),
        { headers: { 'content-type': 'text/html; charset=utf-8' } })));
  }
  // Everything else falls through to the network untouched (no respondWith).
});
`;

export const startServer = async () => {
  const state = {
    sw: { 'sw.js': 'v1', 'sw-a.js': 'a1', 'sw-b.js': 'b1' },
    /** Extra response headers per path (e.g. Clear-Site-Data). */
    headers: {},
    /** When set, /sw.js serves THIS version only to requests carrying the
     * `Service-Worker: script` header (the browser's own update fetch). */
    hostileForSwHeader: null,
    log: [],
    /** Beacon-mode reports, newest last: { at, state }. */
    reports: [],
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const p = url.pathname;
    const swHeader = req.headers['service-worker'] ?? null;
    state.log.push({ path: p, swHeader, cache: req.headers['cache-control'] ?? null });
    const extra = state.headers[p] ?? {};
    const send = (status, type, body) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...extra });
      res.end(body);
    };
    if (p.endsWith('.js') && p.slice(1) in state.sw) {
      const name = p.slice(1);
      const version =
        name === 'sw.js' && state.hostileForSwHeader !== null && swHeader === 'script'
          ? state.hostileForSwHeader
          : state.sw[name];
      return send(200, 'application/javascript', SW(version, name));
    }
    if (p === '/data.json') return send(200, 'application/json', '{"ok":true}');
    if (p === '/report' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { try { state.reports.push({ at: Date.now(), state: JSON.parse(body) }); } catch {} send(204, 'text/plain', ''); });
      return;
    }
    if (p === '/' || p.endsWith('.html')) return send(200, 'text/html; charset=utf-8', PAGE('network'));
    send(404, 'text/plain', 'nope');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { state, origin, close: () => new Promise((r) => server.close(r)) };
};

export const waitFor = async (page, pred, ms = 8000) => {
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => window.rt.state());
    if (pred(s)) return s;
    if (Date.now() - t0 > ms) return { ...s, TIMEOUT: true };
    await page.waitForTimeout(150);
  }
};

export const versionOf = (engine, browser) => `${engine} ${browser.version()}`;

export const report = (name, rows) => {
  console.log(`\n=== ${name}`);
  for (const r of rows) console.log(JSON.stringify(r));
};
