// Zero-auth landing hint. The OAuth session lives in the library's IndexedDB
// store, which Browse cannot read without importing the auth client — and Browse
// ships zero auth code. So the auth boot flow mirrors "is there a live session?"
// into a localStorage flag that Browse's pre-paint inline script (index.html)
// reads cheaply to route a signed-in home landing to the Cookbook. The KEY here
// MUST match the string hardcoded in index.html's inline script.

const KEY = 'arecipe-session';
// When the session was first seen on this device. The OAuth library exposes no
// "signed in at" time, so this stamps the first boot that observes a live
// session and survives until sign-out. Display-only (Account page); like the
// hint itself it carries no token material.
const SINCE_KEY = 'arecipe-session-since';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Reflect session presence into the landing hint. Defensive: a storage failure
 * (private mode) just means the landing falls back to Browse — never throws. */
export const setSessionHint = (active: boolean, storage?: StorageLike): void => {
  try {
    const store = storage ?? window.localStorage;
    if (active) {
      store.setItem(KEY, '1');
      // Stamp once, on the first boot that sees the session; later boots keep
      // the original time so "signed in since" doesn't reset every page load.
      if (store.getItem(SINCE_KEY) === null) {
        store.setItem(SINCE_KEY, new Date().toISOString());
      }
    } else {
      store.removeItem(KEY);
      store.removeItem(SINCE_KEY);
    }
  } catch {
    /* private mode / blocked storage: harmless — landing defaults to Browse */
  }
};

/** Read the landing hint — true when a session was last seen active. The same
 * zero-auth "is signed in?" signal index.html's pre-paint script reads inline;
 * pages that gate signed-in surfaces (e.g. Cookbook) key off this so they stay
 * consistent with the landing router. Defensive: a storage failure reads false. */
export const hasSessionHint = (storage?: StorageLike): boolean => {
  try {
    return (storage ?? window.localStorage).getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/** When the current session was first seen on this device, or null when signed
 * out (or the stamp is missing/corrupt). Defensive like the hint reads. */
export const getSessionSince = (storage?: StorageLike): Date | null => {
  try {
    const raw = (storage ?? window.localStorage).getItem(SINCE_KEY);
    if (raw === null) return null;
    const when = new Date(raw);
    return Number.isNaN(when.getTime()) ? null : when;
  } catch {
    return null;
  }
};
