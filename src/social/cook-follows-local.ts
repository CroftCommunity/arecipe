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
 *  placeholder until a real handle is resolved.
 *
 *  D1: `publishedRkey` is the marker that this device believes a PDS
 *  `app.arecipe.cookFollow` record exists for this follow (its rkey). A row WITH
 *  it is "published" — the reconciling mirror may prune it if the record vanishes
 *  remotely, and the D6 publish offer skips it. A row WITHOUT it is local-only
 *  (followed signed-out, or a publish that hasn't happened yet) — the offer's
 *  material. Optional so pre-marker stores parse unchanged. */
export type LocalCookFollow = { did: string; handle: string; publishedRkey?: string };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'cook-follows';

export type CookFollowsLocal = {
  /** The followed cooks, in insertion order. */
  list: () => LocalCookFollow[];
  /** Is this DID already followed? */
  has: (did: string) => boolean;
  /** Follow a cook. Idempotent by DID — a duplicate add is a no-op (the first
   *  handle wins; a later add never overwrites or duplicates, marker included). */
  add: (follow: LocalCookFollow) => void;
  /** Unfollow a cook by DID. */
  remove: (did: string) => void;
  /** D1: stamp the published-record rkey on an existing row (upsert). No-op when
   *  the DID is absent (never conjures a row) or the rkey is already set to the
   *  same value (no write thrash). */
  markPublished: (did: string, rkey: string) => void;
};

export const createCookFollowsLocal = (opts: { storage?: StorageLike } = {}): CookFollowsLocal => {
  const storage = opts.storage ?? window.localStorage;

  const read = (): LocalCookFollow[] => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      // Tolerate a wild/partial store: keep only well-shaped { did, handle } rows,
      // carrying the optional string publishedRkey (D1) through untouched. A
      // mistyped marker is dropped, not preserved — a required field still fails
      // loud (missing did/handle drops the row).
      const rows: LocalCookFollow[] = [];
      for (const r of parsed) {
        if (typeof r !== 'object' || r === null) continue;
        const row = r as Record<string, unknown>;
        if (typeof row['did'] !== 'string' || typeof row['handle'] !== 'string') continue;
        const follow: LocalCookFollow = { did: row['did'], handle: row['handle'] };
        if (typeof row['publishedRkey'] === 'string') follow.publishedRkey = row['publishedRkey'];
        rows.push(follow);
      }
      return rows;
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
    markPublished: (did, rkey) => {
      const follows = read();
      let changed = false;
      const next = follows.map((f) => {
        if (f.did === did && f.publishedRkey !== rkey) {
          changed = true;
          return { ...f, publishedRkey: rkey };
        }
        return f;
      });
      if (changed) write(next); // no-op when the DID is absent or already stamped
    },
  };
};
