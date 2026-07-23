// Screen wake lock (RUN-COOK-FOCUS D1): a thin, feature-detected wrapper around
// the Screen Wake Lock API for the focus cook view — keep the screen awake with
// your hands in a bowl. Deliberately minimal and defensive:
//
//   - Unsupported (no API) and denied (request rejects, e.g. hidden document, or
//     an older installed iOS PWA before Safari 18.4) are SILENT: acquire()
//     resolves false, the state reflects it, nothing throws. No nag copy.
//   - A held lock is released automatically by the platform when the page hides;
//     the module owns a single `wanted` flag (NOT the sentinel) as the source of
//     truth, and re-acquires a NEW sentinel when the page becomes visible again —
//     unless the caller has explicitly released.
//   - A released sentinel can't be reused, so re-acquire always requests a fresh
//     one.

export type WakeLockState = 'unsupported' | 'idle' | 'held' | 'denied';

export interface ScreenWakeLock {
  /** Request the lock. false = unsupported or denied. Never throws/rejects. */
  acquire(): Promise<boolean>;
  /** Drop the lock and stop wanting it. Idempotent (a no-op if not held). */
  release(): Promise<void>;
  readonly state: WakeLockState;
  /** Observe state transitions; returns an unsubscribe. */
  subscribe(fn: (state: WakeLockState) => void): () => void;
}

export const createScreenWakeLock = (): ScreenWakeLock => {
  // Feature-detect. `'wakeLock' in navigator` is the primary test; the extra
  // null guard covers the genuinely-absent surface (an own `wakeLock: undefined`
  // shape) without a non-null assertion, per D1.
  const api = 'wakeLock' in navigator ? navigator.wakeLock : undefined;
  const supported = api !== undefined && api !== null;

  let state: WakeLockState = supported ? 'idle' : 'unsupported';
  let wanted = false;
  let sentinel: WakeLockSentinel | null = null;
  const subscribers = new Set<(s: WakeLockState) => void>();

  const setState = (next: WakeLockState): void => {
    if (next === state) return;
    state = next;
    for (const fn of subscribers) fn(state);
  };

  const requestSentinel = async (): Promise<boolean> => {
    if (!supported || api === undefined || api === null) return false;
    try {
      const held = await api.request('screen');
      sentinel = held;
      setState('held');
      held.addEventListener('release', () => {
        // Platform released it (page hidden, low battery, power-save). Reflect
        // idle but keep `wanted` — visibility may re-acquire below.
        if (sentinel === held) sentinel = null;
        setState('idle');
      });
      return true;
    } catch {
      // NotAllowedError (hidden document / denied) or any other rejection —
      // silent. A later visibilitychange may still succeed if still wanted.
      sentinel = null;
      setState('denied');
      return false;
    }
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      // The platform auto-releases on hide; treat our sentinel as dead so the
      // next visible re-acquires a fresh one (a released sentinel can't reuse).
      sentinel = null;
      return;
    }
    if (wanted && sentinel === null) void requestSentinel();
  };
  if (supported) document.addEventListener('visibilitychange', onVisibility);

  const acquire = async (): Promise<boolean> => {
    if (!supported) return false;
    wanted = true;
    return requestSentinel();
  };

  const release = async (): Promise<void> => {
    wanted = false;
    const held = sentinel;
    sentinel = null;
    if (held !== null) {
      try {
        await held.release();
      } catch {
        /* already released / platform hiccup — nothing to do */
      }
    }
    if (supported) setState('idle');
  };

  const subscribe = (fn: (s: WakeLockState) => void): (() => void) => {
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  };

  return {
    acquire,
    release,
    get state() {
      return state;
    },
    subscribe,
  };
};
