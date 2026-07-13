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
      try {
        if (remember) storage.setItem(REMEMBER_KEY, token);
        else storage.removeItem(REMEMBER_KEY);
      } catch {
        /* private mode: remember silently downgrades to session-only */
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
