// F2 on a real phone (2026-09-21). Does a WAITING service worker become active
// when Android kills the browser and the cook relaunches — and does a plain
// backgrounding (HOME) leave it waiting? The harness origin runs on the Mac and
// the phone reaches it at http://127.0.0.1:<port> through `adb reverse`, which
// is a secure context, so service workers behave as on https.
//
//   node tests/red-team/device/f2-phone-restart.mjs <serial> <chrome|sbrowser> [label]
//
// The page is driven over the browser's DevTools socket (raw CDP, no Playwright
// on the phone). Prints one JSON row; copy it into results/.
import { execFileSync } from 'node:child_process';
import { startServer } from '../harness.mjs';

const [serial, browser = 'chrome', label = ''] = process.argv.slice(2);
if (!serial) throw new Error('usage: <serial> <chrome|sbrowser> [label]');
const ADB = process.env.ADB ?? `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = browser === 'sbrowser' ? 'com.sec.android.app.sbrowser' : 'com.android.chrome';
const SOCKET_RE = browser === 'sbrowser' ? /@Terrace_devtools_remote[\w]*/ : /@chrome_devtools_remote[\w]*/;
const CDP_PORT = 9350 + Math.floor(Math.random() * 100);

const adb = (...args) => execFileSync(ADB, ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString().slice(11, 19);

const activity = adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.VIEW', '-d', 'http://127.0.0.1:1/', PKG).split('\n').pop();
const launch = (url) => adb('shell', 'am', 'start', '-W', '-n', activity, '-a', 'android.intent.action.VIEW', '-d', url);
const foreground = () => adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
const home = () => adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
const forceStop = () => adb('shell', 'am', 'force-stop', PKG);

const forwardCdp = async (origin) => {
  // Several sockets can exist (observed on the Pixel: a pid-suffixed one that
  // answers /json/version as a different Chrome build and lists no pages).
  // Choose the one whose /json/list actually holds a page on our origin.
  for (let i = 0; i < 60; i++) {
    const socks = [...new Set(adb('shell', 'cat', '/proc/net/unix').match(new RegExp(SOCKET_RE, 'g')) ?? [])];
    for (const sock of socks) {
      adb('forward', `tcp:${CDP_PORT}`, `localabstract:${sock.slice(1)}`);
      try {
        const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
        if (list.some((t) => t.type === 'page' && t.url.startsWith(origin))) {
          return `${(await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).Browser} via ${sock}`;
        }
      } catch { /* not up yet */ }
      adb('forward', '--remove', `tcp:${CDP_PORT}`);
    }
    await sleep(500);
  }
  throw new Error('no devtools socket lists a page on ' + origin);
};

/** Evaluate an expression in the page whose URL starts with `origin`. */
const evalInPage = async (origin, expression) => {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.url.startsWith(origin));
  if (!page) throw new Error(`no page target for ${origin}; have ${targets.map((t) => t.url).join(', ')}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const result = await new Promise((res, rej) => {
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id === 1) res(m.result); };
    ws.onerror = rej;
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    setTimeout(() => rej(new Error('evaluate timed out')), 15000);
  });
  ws.close();
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ' ' + JSON.stringify(result.exceptionDetails.exception));
  return result.result.value;
};
const state = (origin) => evalInPage(origin, 'window.rt.state()');
const waitState = async (origin, pred, ms = 20000) => {
  const t0 = Date.now();
  for (;;) {
    let s;
    try { s = await state(origin); } catch (e) { s = { err: String(e) }; }
    if (pred(s)) return s;
    if (Date.now() - t0 > ms) return { ...s, TIMEOUT: true };
    await sleep(500);
  }
};

const { state: srv, origin: macOrigin, close } = await startServer();
const port = new URL(macOrigin).port;
adb('reverse', `tcp:${port}`, `tcp:${port}`);
const origin = `http://127.0.0.1:${port}`;
const row = { device: `${adb('shell', 'getprop', 'ro.product.model')} android ${adb('shell', 'getprop', 'ro.build.version.release')}`, browser: PKG, label, activity };
const swLog = () => srv.log.filter((l) => l.path === '/sw.js').map((l) => l.swHeader);
try {
  forceStop(); await sleep(1000);
  launch(origin + '/');
  row.browserVersion = await forwardCdp(origin);
  const s1 = await waitState(origin, (s) => s.controllerVersion === 'v1');
  row.step1_first_launch = { servedBy: s1.servedBy, controllerVersion: s1.controllerVersion, TIMEOUT: s1.TIMEOUT };
  // The hostile deploy: same URL, new bytes; the page's own register()/update() finds it.
  srv.sw['sw.js'] = 'v2';
  await evalInPage(origin, 'window.rt.reg.update().then(() => "ok", (e) => String(e))');
  const s2 = await waitState(origin, (s) => s.waiting !== null);
  row.step2_waiting = { controllerVersion: s2.controllerVersion, waiting: s2.waiting, events: s2.events, TIMEOUT: s2.TIMEOUT };
  // Variant A: HOME for 30 s, bring the browser back, same tab.
  home(); console.log(now(), 'backgrounded 30 s'); await sleep(30000); foreground(); await sleep(2000);
  const s3 = await waitState(origin, (s) => s.controllerVersion !== null && !s.err, 10000);
  row.step3_after_background = { servedBy: s3.servedBy, controllerVersion: s3.controllerVersion, waiting: s3.waiting, active: s3.active, events: s3.events, err: s3.err };
  // Variant B: the OS kills the browser; the cook relaunches.
  forceStop(); console.log(now(), 'force-stopped'); await sleep(2000);
  const fetchesBefore = swLog().length;
  launch(origin + '/');
  await forwardCdp(origin);
  const s4 = await waitState(origin, (s) => s.controllerVersion !== null && s.controllerVersion !== 'timeout' && !s.err);
  row.step4_after_kill_relaunch = { servedBy: s4.servedBy, controllerVersion: s4.controllerVersion, waiting: s4.waiting, active: s4.active, events: s4.events, swFetchesDuringRelaunch: swLog().slice(fetchesBefore) };
  // Variant C (F14-adjacent): browser closed, origin left up — any unsolicited worker fetch?
  forceStop(); const n = srv.log.length; console.log(now(), 'watching for unsolicited fetches for 60 s'); await sleep(60000);
  row.step5_unsolicited_fetches_while_closed = srv.log.slice(n).map((l) => `${l.path}${l.swHeader ? ' [Service-Worker]' : ''}`);
} catch (err) {
  row.error = String(err);
} finally {
  // Tidy the phone: close the tabs this run opened, then drop the forwards.
  try {
    launch(origin + '/'); await forwardCdp(origin);
    for (const t of await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()) {
      if (t.type === 'page' && t.url.startsWith('http://127.0.0.1:')) await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`);
    }
    forceStop();
  } catch { /* best effort */ }
  try { adb('forward', '--remove', `tcp:${CDP_PORT}`); adb('reverse', '--remove', `tcp:${port}`); } catch { /* best effort */ }
  await close();
}
console.log(JSON.stringify(row));
