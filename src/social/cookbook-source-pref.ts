// Cookbook source preference (Mine | Liked | All). The signed-in cookbook
// remembers the last-chosen source so it doesn't reset each visit. Defensive
// persistence with an injectable storage, mirroring createBrowsePrefs — a
// blocked/absent store degrades to the caller's fallback rather than throwing.

import { log } from '../log.js';

export type CookbookSource = 'all' | 'mine' | 'liked';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'cookbook-source';

const isSource = (v: unknown): v is CookbookSource => v === 'all' || v === 'mine' || v === 'liked';

export type SourcePref = {
  /** The stored source, or `fallback` when absent/invalid/unreadable. */
  load: (fallback: CookbookSource) => CookbookSource;
  save: (source: CookbookSource) => void;
};

export const createSourcePref = (opts: { storage?: StorageLike } = {}): SourcePref => {
  const storage = opts.storage ?? window.localStorage;
  return {
    load: (fallback) => {
      try {
        const v = storage.getItem(KEY);
        if (isSource(v)) return v;
      } catch (err) {
        log.warn('cookbook', 'source pref load failed', { error: String(err) });
      }
      return fallback;
    },
    save: (source) => {
      try {
        storage.setItem(KEY, source);
      } catch (err) {
        log.warn('cookbook', 'source pref save failed', { error: String(err) });
      }
    },
  };
};
