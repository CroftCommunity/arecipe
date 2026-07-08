// Zero-auth landing hint. The OAuth session lives in the library's IndexedDB
// store, which Browse cannot read without importing the auth client — and Browse
// ships zero auth code. So the auth boot flow mirrors "is there a live session?"
// into a localStorage flag that Browse's pre-paint inline script (index.html)
// reads cheaply to route a signed-in home landing to the Cookbook. The KEY here
// MUST match the string hardcoded in index.html's inline script.

const KEY = 'arecipe-session';

/** Reflect session presence into the landing hint. Defensive: a storage failure
 * (private mode) just means the landing falls back to Browse — never throws. */
export const setSessionHint = (active: boolean): void => {
  try {
    if (active) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode / blocked storage: harmless — landing defaults to Browse */
  }
};
