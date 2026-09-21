// F2 on a phone browser WITHOUT a usable DevTools socket (Samsung Internet
// ships with remote debugging off). Same sequence as f2-phone-restart.mjs, but
// the page reports its own state to the origin (harness beacon mode) and runs
// reg.update() itself when launched with ?update=1.
//
//   node tests/red-team/device/f2-phone-restart-beacon.mjs <serial> <package> [label]
import { execFileSync } from 'node:child_process';
import { startServer } from '../harness.mjs';

const [serial, PKG = 'com.sec.android.app.sbrowser', label = ''] = process.argv.slice(2);
if (!serial) throw new Error('usage: <serial> <package> [label]');
const ADB = process.env.ADB ?? `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const adb = (...args) => execFileSync(ADB, ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString().slice(11, 19);
const activity = adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.VIEW', '-d', 'http://127.0.0.1:1/', PKG).split('\n').pop();
const launch = (url) => adb('shell', 'am', 'start', '-W', '-n', activity, '-a', 'android.intent.action.VIEW', '-d', url);
const foreground = () => adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
const home = () => adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
const forceStop = () => adb('shell', 'am', 'force-stop', PKG);

const { state: srv, origin: macOrigin, close } = await startServer();
const port = new URL(macOrigin).port;
adb('reverse', `tcp:${port}`, `tcp:${port}`);
const origin = `http://127.0.0.1:${port}`;
const version = adb('shell', 'dumpsys', 'package', PKG).match(/versionName=([^\s]+)/)?.[1];
const row = { device: `${adb('shell', 'getprop', 'ro.product.model')} android ${adb('shell', 'getprop', 'ro.build.version.release')}`, browser: `${PKG} ${version}`, label, mode: 'beacon' };
const latest = () => srv.reports.at(-1)?.state ?? null;
const waitReport = async (pred, ms = 25000) => {
  const t0 = Date.now();
  for (;;) {
    const s = latest();
    if (s && pred(s)) return s;
    if (Date.now() - t0 > ms) return { ...(s ?? {}), TIMEOUT: true };
    await sleep(500);
  }
};
const pick = (s) => s && { servedBy: s.servedBy, controllerVersion: s.controllerVersion, waiting: s.waiting, active: s.active, events: s.events, TIMEOUT: s.TIMEOUT };
const swLog = () => srv.log.filter((l) => l.path === '/sw.js').map((l) => l.swHeader);
try {
  forceStop(); await sleep(1000);
  launch(origin + '/?beacon=1');
  row.step1_first_launch = pick(await waitReport((s) => s.controllerVersion === 'v1'));
  srv.sw['sw.js'] = 'v2';
  srv.reports.length = 0;
  launch(origin + '/?beacon=1&update=1'); // a second tab of the same origin runs reg.update()
  row.step2_waiting = pick(await waitReport((s) => s.waiting !== null));
  home(); console.log(now(), 'backgrounded 30 s'); await sleep(30000); foreground(); await sleep(3000);
  srv.reports.length = 0;
  row.step3_after_background = pick(await waitReport((s) => s.controllerVersion !== null, 15000));
  forceStop(); console.log(now(), 'force-stopped'); await sleep(2000);
  const fetchesBefore = swLog().length; srv.reports.length = 0;
  launch(origin + '/?beacon=1');
  const s4 = await waitReport((s) => s.controllerVersion !== null && s.controllerVersion !== 'timeout');
  row.step4_after_kill_relaunch = { ...pick(s4), swFetchesDuringRelaunch: swLog().slice(fetchesBefore) };
  forceStop(); const n = srv.log.length; console.log(now(), 'watching for unsolicited fetches for 60 s'); await sleep(60000);
  row.step5_unsolicited_fetches_while_closed = srv.log.slice(n).map((l) => `${l.path}${l.swHeader ? ' [Service-Worker]' : ''}`);
} catch (err) {
  row.error = String(err);
} finally {
  try { adb('reverse', '--remove', `tcp:${port}`); } catch { /* best effort */ }
  await close();
}
console.log(JSON.stringify(row));
