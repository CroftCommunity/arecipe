// Cook follows — device-local tier (D4/D5). A durable localStorage list of the
// cooks you've followed, and the UNIVERSAL read model: Browse (the zero-auth
// bundle) reads only this store to compose its merged default feed, and signed-in
// pages mirror the PDS cookFollow records down into it (see cook-follows-pds.ts).
// That split keeps the browse bundle-split guard intact and makes signed-out
// follow fall out for free.
//
// Unlike the prefs stores (reach/starter, which persist the DISABLED exception so
// the default needs no storage), a follow is additive user data — we store the
// full list. Defensive throughout: a corrupt/denied read degrades to empty, a
// denied write degrades silently (the follow lives for this page only).

import { log } from '../log.js';

/** One followed cook. The handle is a display hint (the DID is authoritative and
 *  the dedup key); a mirror-down that only knows the DID stores it as the handle
 *  placeholder until a real handle is resolved. */
export type LocalCookFollow = { did: string; handle: string };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'cook-follows';

export type CookFollowsLocal = {
  /** The followed cooks, in insertion order. */
  list: () => LocalCookFollow[];
  /** Is this DID already followed? */
  has: (did: string) => boolean;
  /** Follow a cook. Idempotent by DID — a duplicate add is a no-op (the first
   *  handle wins; a later add never overwrites or duplicates). */
  add: (follow: LocalCookFollow) => void;
  /** Unfollow a cook by DID. */
  remove: (did: string) => void;
};

export const createCookFollowsLocal = (opts: { storage?: StorageLike } = {}): CookFollowsLocal => {
  const storage = opts.storage ?? window.localStorage;

  const read = (): LocalCookFollow[] => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      // Tolerate a wild/partial store: keep only well-shaped { did, handle } rows.
      return parsed.filter(
        (r): r is LocalCookFollow =>
          typeof r === 'object' &&
          r !== null &&
          typeof (r as Record<string, unknown>)['did'] === 'string' &&
          typeof (r as Record<string, unknown>)['handle'] === 'string',
      );
    } catch (err) {
      log.warn('cook-follows', 'local read failed', { error: String(err) });
      return [];
    }
  };

  const write = (follows: LocalCookFollow[]): void => {
    try {
      if (follows.length === 0) storage.removeItem(STORAGE_KEY);
      else storage.setItem(STORAGE_KEY, JSON.stringify(follows));
    } catch (err) {
      log.warn('cook-follows', 'local write failed', { error: String(err) });
    }
  };

  return {
    list: read,
    has: (did) => read().some((f) => f.did === did),
    add: (follow) => {
      const follows = read();
      if (follows.some((f) => f.did === follow.did)) return; // idempotent by DID
      write([...follows, follow]);
    },
    remove: (did) => {
      const follows = read();
      const next = follows.filter((f) => f.did !== did);
      if (next.length !== follows.length) write(next);
    },
  };
};
