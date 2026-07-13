// The GitHub PAT holder — the security-sensitive seam (plan D1). Two paths, one
// interface, and CRUCIALLY no raw-token readback (the UI can never render it):
//
//  - DEFAULT (secure): the token is handed to the service worker, which holds it
//    in memory and injects `Authorization` on api.github.com requests. The page
//    never keeps the string, so an XSS cannot exfiltrate it (mirrors the DPoP
//    "inert if stolen" property). `authorizedFetch` just calls fetch — the SW
//    adds the header.
//  - OPT-IN "remember on this device" (less secure): the token is persisted to
//    localStorage so it survives SW eviction with zero re-entry. Persistence is
//    XSS-readable — a conscious tradeoff the UI states plainly. On this path
//    `authorizedFetch` attaches the header itself from storage.
//
// DEVICE-LOCAL: never written to the PDS (a bearer secret must not sync). The SW
// wiring lives in sw.ts; here it is an injectable channel so this module is
// unit-tested with a fake.

import { log as defaultLogger, type Logger } from '../log.js';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Channel to the service worker that holds the token in memory (secure path). */
export type SwTokenChannel = {
  set: (token: string) => Promise<void>;
  clear: () => Promise<void>;
  has: () => Promise<boolean>;
};

const REMEMBER_KEY = 'arecipe.calendar-token.v1';

export type TokenProvider = {
  /** Whether a token is available (remembered in storage, or held by the SW). */
  hasToken: () => Promise<boolean>;
  /** Store the token. `remember` persists it to localStorage (less secure). */
  set: (token: string, opts: { remember: boolean }) => Promise<void>;
  clear: () => Promise<void>;
  /** A fetch authorized for api.github.com — never returns the token to callers. */
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

/** The real SW channel: postMessages the controlling service worker (sw.ts).
 * `has` round-trips over a MessageChannel with a short timeout (no controller,
 * or no reply, ⇒ false). Injected as a fake in unit tests. */
export const createSwTokenChannel = (): SwTokenChannel => {
  const controller = (): ServiceWorker | null =>
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker.controller
      : null;
  return {
    set: async (token) => {
      controller()?.postMessage({ type: 'ARECIPE_GH_TOKEN_SET', token });
    },
    clear: async () => {
      controller()?.postMessage({ type: 'ARECIPE_GH_TOKEN_CLEAR' });
    },
    has: () => {
      const c = controller();
      if (c === null) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(false), 500);
        channel.port1.onmessage = (e: MessageEvent): void => {
          clearTimeout(timer);
          resolve(e.data === true);
        };
        c.postMessage({ type: 'ARECIPE_GH_TOKEN_HAS' }, [channel.port2]);
      });
    },
  };
};

export const createTokenProvider = (
  opts: { storage?: StorageLike; sw?: SwTokenChannel; fetchFn?: typeof fetch; logger?: Logger } = {},
): TokenProvider => {
  const storage = opts.storage ?? window.localStorage;
  const sw = opts.sw;
  const fetchFn = opts.fetchFn ?? fetch;
  const logger = opts.logger ?? defaultLogger;

  const remembered = (): string | null => {
    try {
      return storage.getItem(REMEMBER_KEY);
    } catch {
      return null;
    }
  };

  return {
    hasToken: async () => {
      if (remembered() !== null) return true;
      if (sw === undefined) return false;
      try {
        return await sw.has();
      } catch {
        return false;
      }
    },
    set: async (token, { remember }) => {
      // Two disjoint paths (D1): remember → page-level header from localStorage;
      // otherwise → the SW holds it in memory and the page never keeps it.
      if (remember) {
        try {
          storage.setItem(REMEMBER_KEY, token);
        } catch {
          /* private mode: remember silently downgrades to session-only */
        }
        if (sw !== undefined) {
          try {
            await sw.clear();
          } catch {
            /* ensure the SW isn't also holding a stale copy */
          }
        }
        return;
      }
      try {
        storage.removeItem(REMEMBER_KEY);
      } catch {
        /* nothing persisted */
      }
      if (sw !== undefined) {
        try {
          await sw.set(token);
        } catch (err) {
          logger.warn('calendar-publish', 'SW token handoff failed', { error: String(err) });
        }
      }
    },
    clear: async () => {
      try {
        storage.removeItem(REMEMBER_KEY);
      } catch {
        /* nothing to clear */
      }
      if (sw !== undefined) {
        try {
          await sw.clear();
        } catch {
          /* best effort */
        }
      }
    },
    authorizedFetch: (input, init) => {
      const token = remembered();
      if (token !== null) {
        const headers = new Headers(init?.headers);
        headers.set('Authorization', `Bearer ${token}`);
        return fetchFn(input, { ...init, headers });
      }
      // Secure path: the SW injects Authorization; the page holds nothing.
      return fetchFn(input, init);
    },
  };
};
