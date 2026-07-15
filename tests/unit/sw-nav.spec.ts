// Service-worker navigation strategy (pure core). The SW's navigate handler is
// otherwise untestable in the hermetic harness (Playwright + esbuild don't
// replicate cross-path SW navigation control), so the DECISION lives here as a
// pure function over injectable cache/network probes and is unit-tested directly;
// sw.ts is a thin adapter that supplies the real caches/fetch.
//
// The rule (fixes the pr-preview hijack): a KNOWN document (exact cache hit) is
// served cache-first with a background revalidate; an UNKNOWN navigation is
// NETWORK-FIRST — the cached app shell is a fallback ONLY when the network fails
// (offline). Never hand our shell to a co-hosted foreign path while the network
// could serve its true content.
import { describe, expect, it, vi } from 'vitest';
import { navigationResponse } from '../../src/sw-nav.js';

const res = (label: string): Response => new Response(label);

describe('navigationResponse', () => {
  it('known doc (exact cache hit): serves cache, revalidates in the background', async () => {
    const cached = res('cached-shell');
    const fetchNetwork = vi.fn(async () => res('fresh'));
    const out = await navigationResponse({
      matchExact: async () => cached,
      fetchNetwork,
      matchShell: async () => res('index-shell'),
    });
    expect(out).toBe(cached);
    expect(fetchNetwork).toHaveBeenCalledTimes(1); // background revalidate still fires
  });

  it('unknown doc, network up: serves the network response, NOT the cached shell', async () => {
    const fresh = res('foreign-network-doc');
    const matchShell = vi.fn(async () => res('index-shell'));
    const out = await navigationResponse({
      matchExact: async () => undefined,
      fetchNetwork: async () => fresh,
      matchShell,
    });
    expect(out).toBe(fresh);
    expect(matchShell).not.toHaveBeenCalled(); // the shell must not hijack the path
  });

  it('unknown doc, offline: falls back to the cached shell', async () => {
    const shell = res('index-shell');
    const out = await navigationResponse({
      matchExact: async () => undefined,
      fetchNetwork: async () => undefined, // network failed
      matchShell: async () => shell,
    });
    expect(out).toBe(shell);
  });

  it('unknown doc, offline, nothing cached: throws (offline and not cached)', async () => {
    await expect(
      navigationResponse({
        matchExact: async () => undefined,
        fetchNetwork: async () => undefined,
        matchShell: async () => undefined,
      }),
    ).rejects.toThrow(/offline and not cached/);
  });
});
