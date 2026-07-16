// App-wide taste preference (Account page): standing "Only show me" / "Never
// show me" filters by meal category and cuisine, chosen from curated
// vocabularies. A different axis from the diet preference (which shares the
// Account Taste section), applied across the feeds (Browse, Cookbook) and the
// Meals palette.
// Empty = "no preference / show all". Storage is defensive (private mode
// degrades to no preference), matching diet-preference / exclusions.

import { log } from '../log.js';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'taste-preference';

/** An option offered by the curated control: a lowercase match `value` (compared
 *  case-insensitively against a recipe's cuisine/category) + a display `label`. */
export type TasteOption = { value: string; label: string };

/** Curated meal-category vocabulary. Values are lowercase so they match a
 *  recipe's (normalized) recipeCategory case-insensitively. */
export const MEAL_OPTIONS: readonly TasteOption[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'appetizer', label: 'Appetizer' },
  { value: 'side', label: 'Side' },
  { value: 'salad', label: 'Salad' },
  { value: 'soup', label: 'Soup' },
  { value: 'bread', label: 'Bread' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'snack', label: 'Snack' },
  { value: 'drink', label: 'Drink' },
  { value: 'sauce', label: 'Sauce' },
];

/** Curated cuisine vocabulary (lowercase values). */
export const CUISINE_OPTIONS: readonly TasteOption[] = [
  { value: 'american', label: 'American' },
  { value: 'italian', label: 'Italian' },
  { value: 'mexican', label: 'Mexican' },
  { value: 'french', label: 'French' },
  { value: 'greek', label: 'Greek' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'middle eastern', label: 'Middle Eastern' },
  { value: 'indian', label: 'Indian' },
  { value: 'thai', label: 'Thai' },
  { value: 'chinese', label: 'Chinese' },
  { value: 'japanese', label: 'Japanese' },
  { value: 'korean', label: 'Korean' },
  { value: 'vietnamese', label: 'Vietnamese' },
  { value: 'spanish', label: 'Spanish' },
];

/** Selected values per dimension (lowercase, from the vocabularies above). */
export type TasteAxis = { cuisine: string[]; category: string[] };

export type TastePreference = {
  /** Whitelist: when a dimension is non-empty, a recipe must match one of its
   *  values on that dimension. */
  only: TasteAxis;
  /** Blacklist: a recipe matching any value here is hidden. */
  never: TasteAxis;
};

const emptyPreference = (): TastePreference => ({
  only: { cuisine: [], category: [] },
  never: { cuisine: [], category: [] },
});

/** Does a recipe (by its derived facets) survive the taste preference?
 *  `never` wins over `only`. Comparison is case-insensitive. Pure. */
export const matchesTaste = (
  facets: { cuisine: string | null; category: string | null },
  pref: TastePreference,
): boolean => {
  const cui = facets.cuisine === null ? null : facets.cuisine.toLowerCase();
  const cat = facets.category === null ? null : facets.category.toLowerCase();
  // never (blacklist) first — it overrides everything.
  if (cui !== null && pref.never.cuisine.includes(cui)) return false;
  if (cat !== null && pref.never.category.includes(cat)) return false;
  // only (whitelist): a set dimension requires a match.
  if (pref.only.cuisine.length > 0 && (cui === null || !pref.only.cuisine.includes(cui))) return false;
  if (pref.only.category.length > 0 && (cat === null || !pref.only.category.includes(cat))) return false;
  return true;
};

/** True when the preference filters nothing (all four lists empty). */
export const isEmptyTaste = (pref: TastePreference): boolean =>
  pref.only.cuisine.length === 0 &&
  pref.only.category.length === 0 &&
  pref.never.cuisine.length === 0 &&
  pref.never.category.length === 0;

export type TastePreferenceStore = {
  load: () => TastePreference;
  save: (pref: TastePreference) => void;
};

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const toAxis = (v: unknown): TasteAxis => {
  const o = v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return { cuisine: toStringArray(o['cuisine']), category: toStringArray(o['category']) };
};

export const createTastePreference = (opts: { storage?: StorageLike } = {}): TastePreferenceStore => {
  const storage = opts.storage ?? window.localStorage;
  return {
    load: () => {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) return emptyPreference();
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return { only: toAxis(parsed['only']), never: toAxis(parsed['never']) };
      } catch (err) {
        log.warn('taste', 'preference load failed', { error: String(err) });
        return emptyPreference();
      }
    },
    save: (pref) => {
      try {
        if (isEmptyTaste(pref)) storage.removeItem(STORAGE_KEY);
        else storage.setItem(STORAGE_KEY, JSON.stringify(pref));
      } catch (err) {
        log.warn('taste', 'preference save failed', { error: String(err) });
      }
    },
  };
};
