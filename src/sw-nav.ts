// Service-worker navigation strategy (pure core, no SW globals). Extracted from
// sw.ts so the decision is unit-testable — the hermetic e2e harness (Playwright +
// esbuild dev server) does not replicate a service worker controlling a
// cross-path navigation, so this behavior can't be exercised there.
//
// The rule, and the reason it exists: arecipe.app hosts per-PR previews at
// /pr-preview/<n>/ on the SAME origin as the production app, so the production
// worker (scope `/`) sees those navigations. The handler must NOT hand a foreign
// co-hosted path our cached app shell — that shell's hashed bundles would resolve
// under the foreign path, 404, and blank the page. So:
//   - KNOWN document (exact cache hit) → cache-first + background revalidate
//     (fast, offline-robust; freshness comes from the SW update flow).
//   - UNKNOWN navigation → NETWORK-FIRST; the cached shell is a fallback ONLY
//     when the network fails (genuinely offline).

export type NavigationProbes = {
  /** The exact cached document for this request (ignoreSearch), if any. */
  matchExact: () => Promise<Response | undefined>;
  /** Fetch from the network; resolves undefined when the network is unavailable. */
  fetchNetwork: () => Promise<Response | undefined>;
  /** The cached app-shell (scope-relative index.html), if any. */
  matchShell: () => Promise<Response | undefined>;
};

export const navigationResponse = async (probes: NavigationProbes): Promise<Response> => {
  const exact = await probes.matchExact();
  if (exact !== undefined) {
    void probes.fetchNetwork(); // revalidate in the background; don't await
    return exact;
  }
  // Unknown path: prefer the live network so the real document loads. Only when
  // offline do we fall back to our shell — never hijack a foreign path while the
  // network could serve its true content.
  const fresh = await probes.fetchNetwork();
  if (fresh !== undefined) return fresh;
  const shell = await probes.matchShell();
  if (shell !== undefined) return shell;
  throw new Error('offline and not cached');
};
