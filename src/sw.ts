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

import { createReleaseConfig, type ReleaseConfig } from './release/config.js';
import { applyActivateOutcome, overrideVersionFor, shouldDeleteCache } from './release/routing.js';
import { checkOriginManifest } from './release/verify.js';
import { navigationResponse } from './sw-nav.js';

declare const __BUILD_VERSION__: string;
declare const __BUILD_NUMBER__: number;
declare const __RELEASE_PUBKEY__: string | null;
declare const __PRECACHE__: string[];

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `arecipe-${__BUILD_VERSION__}`;

// --- Release config (signed releases D3/D4) ----------------------------------
// Memoized IDB read; the page invalidates it via message when a toggle flips.
// A storage failure degrades to the defaults (no pin, verified-only ON but no
// verdict recorded → normal routing) — the SW must never brick on IDB.
const releaseConfigStore = createReleaseConfig();
let releaseCfg: Promise<ReleaseConfig> | null = null;
const releaseConfig = (): Promise<ReleaseConfig> =>
  (releaseCfg ??= releaseConfigStore.load().catch(() => ({ requireVerified: true })));

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
      // Claim first: verification is a network round-trip and pages must not
      // wait on it to come under control.
      await sw.clients.claim();
      // Self-verify (D3): the new SW checks the origin manifest against its
      // own baked pubkey + version. The outcome is recorded for the page
      // layer (panel/banner) and drives fetch routing; a bad verdict with a
      // lastVerifiedVersion cache keeps this install serving that version.
      // Bounded + failure-tolerant: activation must never brick on this.
      let cfg = await releaseConfig();
      try {
        const outcome = await checkOriginManifest({
          pubkeyHex: __RELEASE_PUBKEY__,
          running: { version: __BUILD_VERSION__, buildNumber: __BUILD_NUMBER__ },
          fetchFn: (input, init) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
        });
        cfg = applyActivateOutcome(cfg, outcome, __BUILD_VERSION__, new Date().toISOString());
        await releaseConfigStore.save(cfg);
      } catch {
        /* verdict unrecorded — routing falls back to the stored config */
      }
      releaseCfg = Promise.resolve(cfg);
      // Cleanup with exemptions: the locked cache and the last verified cache
      // survive version turnover (they are the pin/enforcement targets).
      for (const name of await caches.keys()) {
        if (shouldDeleteCache(name, __BUILD_VERSION__, cfg)) await caches.delete(name);
      }
    })(),
  );
});

sw.addEventListener('message', (event) => {
  const data = event.data as { type?: string; token?: string } | null;
  switch (data?.type) {
    case 'SKIP_WAITING':
      void sw.skipWaiting();
      return;
    case 'ARECIPE_RELEASE_META':
      // The page's source for the RUNNING build's identity (version/buildNumber
      // are deliberately not baked into page bundles — see release/sw-meta.ts).
      event.ports[0]?.postMessage({ version: __BUILD_VERSION__, buildNumber: __BUILD_NUMBER__ });
      return;
    case 'ARECIPE_RELEASE_CONFIG_CHANGED':
      releaseCfg = null; // re-read on the next fetch (pin/enforcement toggled)
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
  if (url.pathname.endsWith('/release-manifest.json')) return; // always live (verification must see the real origin)

  if (event.request.mode === 'navigate') {
    // Navigation strategy (see src/sw-nav.ts): a KNOWN document (exact cache
    // hit) is cache-first with a background revalidate — HTML is stable-named
    // and references hashed bundles, so a cached shell is never stale in a way
    // that matters (a real deploy bumps the SW version, swaps the whole cache,
    // and offers the update toast). An UNKNOWN navigation is network-first, with
    // the cached shell as an offline-only fallback — so a co-hosted foreign path
    // (e.g. a /pr-preview/<n>/ deploy sharing the origin) is never handed our
    // shell, whose hashed bundles would 404 under that path and blank the page.
    event.respondWith(
      (async () => {
        // Release routing (D3/D4): under a pin or an enforcement fallback the
        // navigation is served from the OVERRIDE version's cache — its HTML
        // references that version's hashed bundles, so versions never mix. A
        // missing/incomplete override cache degrades to the normal path.
        const override = overrideVersionFor(await releaseConfig(), __BUILD_VERSION__);
        if (override !== null && override !== __BUILD_VERSION__) {
          const locked = await caches.open(`arecipe-${override}`);
          const hit =
            (await locked.match(event.request, { ignoreSearch: true })) ??
            (await locked.match(new URL('./index.html', sw.registration.scope).href));
          if (hit !== undefined) return hit;
        }
        const cache = await caches.open(CACHE);
        return navigationResponse({
          // ignoreSearch so `recipe.html?u=…` matches the precached
          // `recipe.html` (query params select content at runtime, not a
          // different document). Bare `/` directory nav matches `./`.
          matchExact: () => cache.match(event.request, { ignoreSearch: true }),
          fetchNetwork: () =>
            fetch(event.request)
              .then((fresh) => {
                if (fresh.ok) void cache.put(event.request, fresh.clone());
                return fresh;
              })
              .catch(() => undefined),
          matchShell: () => cache.match(new URL('./index.html', sw.registration.scope).href),
        });
      })(),
    );
    return;
  }

  // Same-origin subresources (hashed bundles, styles, fonts, images):
  // cache-first — hashed names make staleness impossible.
  event.respondWith(
    (async () => {
      // Under an override, that version's cache takes precedence for
      // STABLE-named assets (fonts, manifest) that both versions carry.
      const override = overrideVersionFor(await releaseConfig(), __BUILD_VERSION__);
      if (override !== null && override !== __BUILD_VERSION__) {
        const hit = await (await caches.open(`arecipe-${override}`)).match(event.request);
        if (hit !== undefined) return hit;
      }
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
