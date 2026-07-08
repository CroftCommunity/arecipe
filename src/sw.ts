// Service worker (Phase 8b): the offline shell. Encodes the peadoubleueh
// cache-busting lessons:
// - cache names carry the build version (from build-info via esbuild
//   define); activate deletes every older-version cache
// - the stable-named shell (HTML, styles, fonts, manifest, icons, logos)
//   pre-caches with PER-ASSET failure tolerance
// - hashed bundles are cached on first fetch (cache-first — a new build
//   changes their names, so staleness is structurally impossible)
// - navigations are network-first with cache fallback (fresh when online,
//   shell when offline)
// - CROSS-ORIGIN REQUESTS ARE NEVER TOUCHED: no respondWith, so Playwright
//   route fixtures and the PDS/CDN traffic behave identically with or
//   without the worker
// - a waiting worker applies only on explicit SKIP_WAITING (the update
//   toast asks the user; updates never ambush)

declare const __BUILD_VERSION__: string;
declare const __PRECACHE__: string[];

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `arecipe-${__BUILD_VERSION__}`;

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Per-asset tolerance: one miss must not brick the install.
      await Promise.all(
        __PRECACHE__.map(async (path) => {
          try {
            await cache.add(new Request(path, { cache: 'reload' }));
          } catch {
            /* tolerated; fetched live when needed */
          }
        }),
      );
    })(),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== CACHE && name.startsWith('arecipe-')) await caches.delete(name);
      }
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    void sw.skipWaiting();
  }
});

sw.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== sw.location.origin || event.request.method !== 'GET') return; // never touch cross-origin
  if (url.pathname.endsWith('/build-info.json')) return; // always live (deploy checks, update detection)

  if (event.request.mode === 'navigate') {
    // Cache-first app shell (robust offline; freshness comes from the SW
    // update flow, not per-navigation network). HTML is stable-named and
    // references hashed bundles, so a cached shell is never stale in a way
    // that matters — a real deploy bumps the SW version, which swaps the
    // whole cache and offers the update toast. A background revalidate
    // keeps same-version HTML edits current without blocking the load.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        // ignoreSearch so `recipe.html?u=…` matches the precached
        // `recipe.html` (query params select content at runtime, not a
        // different document). Bare `/` directory nav falls back to index.
        const cached =
          (await cache.match(event.request, { ignoreSearch: true })) ??
          (await cache.match(new URL('./index.html', sw.registration.scope).href));
        const network = fetch(event.request)
          .then((fresh) => {
            if (fresh.ok) void cache.put(event.request, fresh.clone());
            return fresh;
          })
          .catch(() => undefined);
        if (cached !== undefined) {
          void network; // revalidate in the background
          return cached;
        }
        const fresh = await network;
        if (fresh !== undefined) return fresh;
        throw new Error('offline and not cached');
      })(),
    );
    return;
  }

  // Same-origin subresources (hashed bundles, styles, fonts, images):
  // cache-first — hashed names make staleness impossible.
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached !== undefined) return cached;
      const fresh = await fetch(event.request);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        void cache.put(event.request, fresh.clone());
      }
      return fresh;
    })(),
  );
});
