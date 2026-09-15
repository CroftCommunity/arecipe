// @vitest-environment happy-dom
// Signed releases Phase 4 (RED first): the app-wide release banner. Rules
// (D7): shown ONLY for bad verdicts (unsigned/invalid — either the fresh
// page-level check or the SW's recorded install verdict) and ONLY on the
// production origin; preview/loopback log instead. Dismissible per session.
// Mounted from the shared nav shell, so it is auth-free by construction —
// Browse hosts it too (the bundle-split guard enforces the import graph).
import { describe, expect, it } from 'vitest';
import { mountReleaseBanner, type ReleaseBannerDeps } from '../../../src/release/banner.js';
import type { ReleaseVerdict } from '../../../src/release/config.js';
import type { VerifyOutcome } from '../../../src/release/verify.js';

const fakeStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

const INVALID: VerifyOutcome = { state: 'invalid', reason: 'bad-signature' };
const VERIFIED_MANIFEST = {
  buildNumber: 1,
  version: 'v1',
  builtAt: 't',
  files: {},
  pubkeyFingerprint: 'fp',
  sig: 's',
};

const deps = (over: Partial<ReleaseBannerDeps>): ReleaseBannerDeps => ({
  originClass: 'production',
  check: () => Promise.resolve<VerifyOutcome>({ state: 'verified', manifest: VERIFIED_MANIFEST }),
  storedVerdict: () => Promise.resolve<ReleaseVerdict | undefined>(undefined),
  storage: fakeStorage(),
  ...over,
});

const mount = async (over: Partial<ReleaseBannerDeps>) => {
  const host = document.createElement('div');
  await mountReleaseBanner(host, deps(over));
  return host;
};

describe('mountReleaseBanner', () => {
  it('an INVALID check on production shows the rust banner, naming what failed', async () => {
    const host = await mount({ check: () => Promise.resolve(INVALID) });
    const banner = host.querySelector('[data-testid=release-banner]');
    expect(banner).not.toBeNull();
    expect(banner?.className).toContain('release-banner');
    expect(banner?.textContent).toMatch(/couldn.t be verified|failed/i);
    expect(banner?.textContent).toMatch(/bad-signature/);
  });

  it('an UNSIGNED verdict recorded by the SW banners even when the fresh check passes', async () => {
    const host = await mount({
      storedVerdict: () =>
        Promise.resolve<ReleaseVerdict | undefined>({
          state: 'unsigned',
          version: 'v1',
          checkedAt: 't',
        }),
    });
    expect(host.querySelector('[data-testid=release-banner]')).not.toBeNull();
  });

  it('verified / couldn\'t-check / stale-mismatch never banner', async () => {
    for (const outcome of [
      { state: 'verified', manifest: VERIFIED_MANIFEST },
      { state: 'unchecked', reason: 'fetch-failed' },
      { state: 'unchecked', reason: 'no-pinned-key' },
      { state: 'stale-mismatch', manifest: VERIFIED_MANIFEST },
    ] as VerifyOutcome[]) {
      const host = await mount({ check: () => Promise.resolve(outcome) });
      expect(host.querySelector('[data-testid=release-banner]'), outcome.state).toBeNull();
    }
  });

  it('preview and loopback log instead of bannering', async () => {
    const logged: string[] = [];
    for (const originClass of ['preview', 'loopback'] as const) {
      const host = await mount({
        originClass,
        check: () => Promise.resolve(INVALID),
        log: (msg) => logged.push(msg),
      });
      expect(host.querySelector('[data-testid=release-banner]')).toBeNull();
    }
    expect(logged).toHaveLength(2);
  });

  it('dismiss removes the banner and holds for the session', async () => {
    const storage = fakeStorage();
    const host = await mount({ check: () => Promise.resolve(INVALID), storage });
    host.querySelector<HTMLButtonElement>('[data-testid=release-banner-dismiss]')?.click();
    expect(host.querySelector('[data-testid=release-banner]')).toBeNull();
    // Same session (same storage) → stays dismissed on the next page.
    const next = await mount({ check: () => Promise.resolve(INVALID), storage });
    expect(next.querySelector('[data-testid=release-banner]')).toBeNull();
    // A new session (fresh storage) banners again.
    const later = await mount({ check: () => Promise.resolve(INVALID), storage: fakeStorage() });
    expect(later.querySelector('[data-testid=release-banner]')).not.toBeNull();
  });
});
