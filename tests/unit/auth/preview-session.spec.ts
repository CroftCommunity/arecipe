// Preview-only demo session. The load-bearing assertions are the SAFETY guards:
//  - it can only activate on a /pr-preview/ path (never production root)
//  - mockSessionBoot throws off a preview origin
//  - the agent is read-only (every network call rejects; no credentials exist)
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_DEMO_DID,
  exitPreviewDemo,
  isPreviewDemoActive,
  isPreviewOrigin,
  mockSessionBoot,
} from '../../../src/auth/preview-session.js';

const memStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

describe('isPreviewOrigin', () => {
  it('is true only on a /pr-preview/ path', () => {
    expect(isPreviewOrigin({ pathname: '/pr-preview/pr-6/account.html', search: '' })).toBe(true);
    expect(isPreviewOrigin({ pathname: '/account.html', search: '' })).toBe(false);
    expect(isPreviewOrigin({ pathname: '/', search: '' })).toBe(false);
  });
});

describe('isPreviewDemoActive', () => {
  it('never activates off a preview origin, even with ?demo', () => {
    expect(isPreviewDemoActive({ pathname: '/account.html', search: '?demo' }, memStorage())).toBe(
      false,
    );
  });

  it('activates via ?demo on a preview origin and persists for the tab', () => {
    const storage = memStorage();
    const loc = { pathname: '/pr-preview/pr-6/account.html', search: '?demo' };
    expect(isPreviewDemoActive(loc, storage)).toBe(true);
    // Persisted → active on a later navigation without the param.
    expect(
      isPreviewDemoActive({ pathname: '/pr-preview/pr-6/meals.html', search: '' }, storage),
    ).toBe(true);
  });

  it('?demo=0 turns it off', () => {
    const storage = memStorage();
    const on = { pathname: '/pr-preview/pr-6/x', search: '?demo' };
    isPreviewDemoActive(on, storage);
    expect(isPreviewDemoActive({ pathname: '/pr-preview/pr-6/x', search: '?demo=0' }, storage)).toBe(
      false,
    );
  });

  it('exitPreviewDemo clears the flag', () => {
    const storage = memStorage();
    isPreviewDemoActive({ pathname: '/pr-preview/pr-6/x', search: '?demo' }, storage);
    exitPreviewDemo(storage);
    expect(isPreviewDemoActive({ pathname: '/pr-preview/pr-6/x', search: '' }, storage)).toBe(false);
  });
});

describe('mockSessionBoot', () => {
  it('throws off a preview origin (never fabricates a session on production)', () => {
    expect(() => mockSessionBoot({ pathname: '/account.html', search: '' })).toThrow(
      'not a preview origin',
    );
  });

  it('returns a fake, read-only signed-in session on a preview origin', async () => {
    const boot = mockSessionBoot({ pathname: '/pr-preview/pr-6/account.html', search: '' });
    expect(boot.agent?.did).toBe(PREVIEW_DEMO_DID);
    expect(boot.provider).not.toBeNull();

    // Every network call rejects — no read or write can succeed.
    const write = (
      boot.agent as unknown as {
        com: { atproto: { repo: { putRecord: (x: unknown) => Promise<unknown> } } };
      }
    ).com.atproto.repo.putRecord({});
    await expect(write).rejects.toThrow('read-only');
  });
});
