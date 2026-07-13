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

// --- Calendar-publish token (plan D1, secure default path) -------------------
// The page hands the GitHub PAT here via postMessage; it lives ONLY in this
// worker's memory (never persisted, never returned to the page) and is attached
// to outbound api.github.com writes below. An XSS in a page can trigger a write
// but cannot read the token string. Cleared on eviction → the page re-enters
// (or uses the opt-in "remember on this device" localStorage path instead).
let githubToken: string | null = null;
const GH_API_ORIGIN = 'https://api.github.com';

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
  const data = event.data as { type?: string; token?: string } | null;
  switch (data?.type) {
    case 'SKIP_WAITING':
      void sw.skipWaiting();
      return;
    case 'ARECIPE_GH_TOKEN_SET':
      githubToken = typeof data.token === 'string' ? data.token : null;
      return;
    case 'ARECIPE_GH_TOKEN_CLEAR':
      githubToken = null;
      return;
    case 'ARECIPE_GH_TOKEN_HAS':
      // Reply on the port the page opened (MessageChannel round-trip).
      event.ports[0]?.postMessage(githubToken !== null);
      return;
    default:
      return;
  }
});

sw.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Calendar-publish: inject the in-memory token on api.github.com writes/reads
  // ONLY while a token is held. With the feature off (the default) githubToken
  // is null and this is a no-op — cross-origin traffic is untouched exactly as
  // before. When held, the page never carries the Authorization header; the SW
  // adds it here so the token stays out of page memory.
  if (url.origin === GH_API_ORIGIN) {
    if (githubToken !== null && (event.request.method === 'GET' || event.request.method === 'PUT')) {
      const token = githubToken;
      event.respondWith(
        (async () => {
          const headers = new Headers(event.request.headers);
          headers.set('Authorization', `Bearer ${token}`);
          return fetch(new Request(event.request, { headers }));
        })(),
      );
    }
    return; // token-less api.github.com traffic falls through untouched
  }

  if (url.origin !== sw.location.origin || event.request.method !== 'GET') return; // never touch other cross-origin
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
