// Minimal service worker for the E5 PWA harness: precache the shell so the app
// boots offline. No unload/beforeunload anywhere (invariant), no measurement
// logic — the SW only serves the shell.
const CACHE = 'measure-harness-v1';
const SHELL = ['/', '/index.html', '/client.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never intercept the flush endpoint — let beacons hit the network.
  if (url.pathname === '/flush') return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
