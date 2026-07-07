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

// Deliberately NO fetch handler: a passthrough respondWith adds nothing and
// routes page requests through the SW, which bypasses Playwright's route
// interception and breaks the hermetic test tier. When a real caching /
// verify-before-install fetch handler lands (M1 decision / Phase 11), the
// hermetic-fixture strategy must be revisited alongside it.
