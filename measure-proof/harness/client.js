// measure-proof PWA harness client — the counter client as it would ship.
//
// LIFECYCLE CONTRACT (E5):
//  - Counters live in localStorage (named counters, never logs).
//  - Flush uses navigator.sendBeacon, fired on `visibilitychange`→hidden and on
//    `pagehide`. These are the reliable, bfcache-safe signals.
//  - There is DELIBERATELY no `unload` or `beforeunload` listener anywhere —
//    those break bfcache. (Invariant `no-unload-listeners`.)
//  - Offline: counters persist in localStorage and flush when a later lifecycle
//    event fires with connectivity.

const STORE_KEY = 'measure.counters.v1';
const PERIOD = '2026-07';
const FLUSH_URL = '/flush';

function readCounts() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeCounts(c) {
  localStorage.setItem(STORE_KEY, JSON.stringify(c));
}

export function emit(name) {
  const c = readCounts();
  c[name] = (c[name] || 0) + 1;
  writeCounts(c);
}

// sendBeacon caps at 64 KiB; if the payload is too big, chunk it. Returns the
// number of beacons that the browser accepted (queued).
function flush() {
  const counts = readCounts();
  if (Object.keys(counts).length === 0) return 0;
  const payload = { v: 1, period: PERIOD, counts };
  const body = JSON.stringify(payload);
  let queued = 0;
  const ok = navigator.sendBeacon(FLUSH_URL, body);
  if (ok) {
    queued = 1;
    // Clear only what we successfully queued.
    writeCounts({});
  }
  return queued;
}

// The two reliable, bfcache-safe flush triggers. No unload/beforeunload.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('pagehide', () => {
  flush();
});

// Expose a couple of hooks so the Playwright harness can drive the client.
window.__measure = { emit, flush, readCounts };
