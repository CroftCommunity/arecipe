// Shopping preferences (Account page): device-local settings the shopping-list
// panel reads. Two axes, one store:
//   - `staples`  — ingredients ALWAYS assumed on hand (salt, pepper, water, …).
//                  Shown in the panel as a muted annotation, but excluded from
//                  every copy / download / AI payload.
//   - `aiInstructions` — free text folded into the "AI shopper" copy (e.g.
//                  "prefer versions we've bought before").
// Empty = "no staples / no extra instructions". Storage is defensive (private
// mode degrades to empty), matching taste-preference / diet-preference /
// exclusions.

import { log } from '../log.js';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'shopping-prefs';

export type ShoppingPrefs = {
  /** Ingredient names assumed on hand (verbatim as typed; matched case- and
   *  plural-insensitively by the list builder). Order-preserving, de-duped. */
  staples: string[];
  /** Custom instructions appended to the AI-shopper copy payload. */
  aiInstructions: string;
};

export const emptyShoppingPrefs = (): ShoppingPrefs => ({ staples: [], aiInstructions: '' });

/** Trim, drop blanks, de-dupe case-insensitively (first spelling wins). */
export const normalizeStaples = (raw: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    const trimmed = s.trim();
    if (trimmed === '') continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
};

const isEmpty = (prefs: ShoppingPrefs): boolean =>
  prefs.staples.length === 0 && prefs.aiInstructions.trim() === '';

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export type ShoppingPrefsStore = {
  load: () => ShoppingPrefs;
  save: (prefs: ShoppingPrefs) => void;
};

export const createShoppingPrefs = (opts: { storage?: StorageLike } = {}): ShoppingPrefsStore => {
  const storage = opts.storage ?? window.localStorage;
  return {
    load: () => {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) return emptyShoppingPrefs();
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return {
          staples: normalizeStaples(toStringArray(parsed['staples'])),
          aiInstructions: typeof parsed['aiInstructions'] === 'string' ? parsed['aiInstructions'] : '',
        };
      } catch (err) {
        log.warn('shopping', 'prefs load failed', { error: String(err) });
        return emptyShoppingPrefs();
      }
    },
    save: (prefs) => {
      const clean: ShoppingPrefs = {
        staples: normalizeStaples(prefs.staples),
        aiInstructions: prefs.aiInstructions,
      };
      try {
        if (isEmpty(clean)) storage.removeItem(STORAGE_KEY);
        else storage.setItem(STORAGE_KEY, JSON.stringify(clean));
      } catch (err) {
        log.warn('shopping', 'prefs save failed', { error: String(err) });
      }
    },
  };
};
