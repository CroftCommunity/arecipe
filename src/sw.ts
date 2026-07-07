// Minimal service worker: install/activate + network passthrough. Its
// registration (and update events) are observable via src/log.ts — see
// tests/e2e/shell.spec.ts. Real offline caching is the M1-checkpoint open
// question; the verify-before-install worker is Phase 11.

// tsconfig carries both DOM and WebWorker libs (app + worker share one
// config in the spike), so `self` types as Window — cast to the worker scope.
const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => {
  void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim());
});

sw.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
