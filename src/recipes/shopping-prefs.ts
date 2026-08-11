// Shopping preferences (Account page): device-local settings the shopping-list
// panel and recipe pages read. Axes, one store:
//   - `staples`  — ingredients ALWAYS assumed on hand (salt, pepper, water, …).
//                  Shown in the panel as a muted annotation, but excluded from
//                  every copy / download / AI payload.
//   - `aiInstructions` — free text folded into the "AI shopper" copy (e.g.
//                  "prefer versions we've bought before").
//   - `substitutions` — from→to ingredient swaps (e.g. ground hamburger →
//                  ground turkey, milk → lactaid milk). Opt-in on a recipe page
//                  (⇄ toggle), applied by default on the shopping list.
//   - `alwaysApplySubstitutions` — when set, the recipe-page ⇄ toggle starts on.
// Empty = "no staples / no substitutions / no extra instructions". Storage is
// defensive (private mode degrades to empty), matching taste-preference /
// diet-preference / exclusions.

import { log } from '../log.js';
import type { Substitution } from './shopping-list.js';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'shopping-prefs';

export type { Substitution };

export type ShoppingPrefs = {
  /** Ingredient names assumed on hand (verbatim as typed; matched case- and
   *  plural-insensitively by the list builder). Order-preserving, de-duped. */
  staples: string[];
  /** Custom instructions appended to the AI-shopper copy payload. */
  aiInstructions: string;
  /** Ingredient swaps (from→to). Order-preserving, de-duped by `from`. */
  substitutions: Substitution[];
  /** When true, a recipe page opens with substitutions already applied. */
  alwaysApplySubstitutions: boolean;
};

export const emptyShoppingPrefs = (): ShoppingPrefs => ({
  staples: [],
  aiInstructions: '',
  substitutions: [],
  alwaysApplySubstitutions: false,
});

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

/** Trim both sides, drop rows missing either side (a swap needs an original AND
 *  a replacement), de-dupe by `from` case-insensitively (first mapping wins). */
export const normalizeSubstitutions = (raw: Substitution[]): Substitution[] => {
  const seen = new Set<string>();
  const out: Substitution[] = [];
  for (const s of raw) {
    const from = (s.from ?? '').trim();
    const to = (s.to ?? '').trim();
    if (from === '' || to === '') continue;
    const key = from.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to });
  }
  return out;
};

const isEmpty = (prefs: ShoppingPrefs): boolean =>
  prefs.staples.length === 0 &&
  prefs.aiInstructions.trim() === '' &&
  prefs.substitutions.length === 0 &&
  !prefs.alwaysApplySubstitutions;

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** Read a stored substitution array defensively: only objects with string
 *  from/to survive; normalization drops the incomplete ones. */
const toSubstitutions = (v: unknown): Substitution[] => {
  if (!Array.isArray(v)) return [];
  const out: Substitution[] = [];
  for (const x of v) {
    if (typeof x !== 'object' || x === null) continue;
    const rec = x as Record<string, unknown>;
    if (typeof rec['from'] === 'string' && typeof rec['to'] === 'string') {
      out.push({ from: rec['from'], to: rec['to'] });
    }
  }
  return out;
};

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
          substitutions: normalizeSubstitutions(toSubstitutions(parsed['substitutions'])),
          alwaysApplySubstitutions: parsed['alwaysApplySubstitutions'] === true,
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
        substitutions: normalizeSubstitutions(prefs.substitutions),
        alwaysApplySubstitutions: prefs.alwaysApplySubstitutions === true,
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
