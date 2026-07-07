// SPIKE (Phase 0 / D3): promoted scaffold, not yet under TDD.
// Minimal service worker: install/activate + network passthrough. Exists so
// the harness probe can verify SW registration is testable under Playwright.
// The real offline / verify-before-install workers are later phases.

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
