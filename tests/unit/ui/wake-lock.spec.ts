// @vitest-environment happy-dom
// Screen wake lock (RUN-COOK-FOCUS D1): a thin, feature-detected wrapper around
// the Screen Wake Lock API. Unsupported/denied are silent (never throw); the
// module owns a single "wanted" flag that survives platform releases and
// re-acquires a NEW sentinel when the page becomes visible again.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScreenWakeLock } from '../../../src/ui/wake-lock.js';

type ReleaseFn = () => void;

interface FakeSentinel {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, fn: ReleaseFn) => void;
  removeEventListener: (type: string, fn: ReleaseFn) => void;
  fireRelease: () => void;
}

const makeSentinel = (): FakeSentinel => {
  const listeners: ReleaseFn[] = [];
  const s = {
    released: false,
    release: vi.fn(() => {
      s.released = true;
      return Promise.resolve();
    }),
    addEventListener: (type: string, fn: ReleaseFn) => {
      if (type === 'release') listeners.push(fn);
    },
    removeEventListener: (type: string, fn: ReleaseFn) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    fireRelease: () => {
      for (const fn of listeners.slice()) fn();
    },
  };
  return s;
};

const installWakeLock = (impl: () => Promise<unknown>): ReturnType<typeof vi.fn> => {
  const request = vi.fn(impl);
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  return request;
};

const setVisibility = (state: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
};

const notAllowed = (): Error => {
  const e = new Error('denied');
  e.name = 'NotAllowedError';
  return e;
};

afterEach(() => {
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'wakeLock');
  setVisibility('visible');
});

describe('createScreenWakeLock', () => {
  it('unsupported navigator: acquire() resolves false, state "unsupported", nothing throws', async () => {
    // no wakeLock installed
    const wl = createScreenWakeLock();
    expect(wl.state).toBe('unsupported');
    await expect(wl.acquire()).resolves.toBe(false);
    expect(wl.state).toBe('unsupported');
  });

  it('happy path: acquire() resolves true, state "held"', async () => {
    installWakeLock(() => Promise.resolve(makeSentinel()));
    const wl = createScreenWakeLock();
    await expect(wl.acquire()).resolves.toBe(true);
    expect(wl.state).toBe('held');
  });

  it('request rejects with NotAllowedError: resolves false, state "denied", no unhandled rejection', async () => {
    installWakeLock(() => Promise.reject(notAllowed()));
    const wl = createScreenWakeLock();
    await expect(wl.acquire()).resolves.toBe(false);
    expect(wl.state).toBe('denied');
  });

  it('platform release event: state becomes "idle" and subscribers are notified', async () => {
    const sentinel = makeSentinel();
    installWakeLock(() => Promise.resolve(sentinel));
    const wl = createScreenWakeLock();
    const seen: string[] = [];
    wl.subscribe((s) => seen.push(s));
    await wl.acquire();
    expect(wl.state).toBe('held');
    sentinel.fireRelease();
    expect(wl.state).toBe('idle');
    expect(seen).toContain('idle');
  });

  it('visibility hidden then visible while wanted: a NEW sentinel is requested', async () => {
    const request = installWakeLock(() => Promise.resolve(makeSentinel()));
    const wl = createScreenWakeLock();
    await wl.acquire();
    expect(request).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    setVisibility('visible');
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('explicit release() then hidden then visible: NO new request', async () => {
    const request = installWakeLock(() => Promise.resolve(makeSentinel()));
    const wl = createScreenWakeLock();
    await wl.acquire();
    expect(request).toHaveBeenCalledTimes(1);
    await wl.release();
    setVisibility('hidden');
    setVisibility('visible');
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('release() twice: no throw, exactly one underlying release call', async () => {
    const sentinel = makeSentinel();
    installWakeLock(() => Promise.resolve(sentinel));
    const wl = createScreenWakeLock();
    await wl.acquire();
    await wl.release();
    await wl.release();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(wl.state).toBe('idle');
  });
});
