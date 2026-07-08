// Shared, app-wide dietary preference: the user's standing "Only show me"
// setting. Written by Settings (Phase 8), read by Browse's renderCurrent
// (Phase 3). Distinct from Browse's transient facet filters — diet is "what
// you eat", a persisted personal default, so it lives in one app-wide store
// rather than the per-browse filter state. Empty = "no preference / show
// all". Storage is defensive (private mode degrades to "no preference"),
// matching exclusions.ts / starter.ts.

import { log } from '../log.js';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'diet-preference';

/** Selected, normalized diet tokens (e.g. ['dietVegetarian', 'dietVegan']). */
export type DietPreference = string[];

/** The canonical diet vocabulary the Settings control offers. Tokens are the
 * NORMALIZED form `recipeFacets` produces (bare, no `#` prefix, no doubled
 * `Diet` suffix), so a preference matches a recipe's `suitableForDiet` after
 * normalization. */
export const DIET_OPTIONS: readonly { token: string; label: string }[] = [
  { token: 'dietVegetarian', label: 'Vegetarian' },
  { token: 'dietVegan', label: 'Vegan' },
  { token: 'dietGlutenFree', label: 'Gluten-free' },
  { token: 'dietDairyFree', label: 'Dairy-free' },
  { token: 'dietLowCarb', label: 'Low-carb' },
];

export type DietPreferenceStore = {
  /** The stored preference, or `[]` when unset/unreadable (= show all). */
  load: () => DietPreference;
  /** Persist the preference; an empty array clears it back to the default. */
  save: (preference: DietPreference) => void;
};

export const createDietPreference = (opts: { storage?: StorageLike } = {}): DietPreferenceStore => {
  const storage = opts.storage ?? window.localStorage;
  return {
    load: () => {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((t): t is string => typeof t === 'string');
      } catch (err) {
        log.warn('browse', 'diet preference load failed', { key: STORAGE_KEY, error: String(err) });
        return [];
      }
    },
    save: (preference) => {
      try {
        if (preference.length === 0) storage.removeItem(STORAGE_KEY);
        else storage.setItem(STORAGE_KEY, JSON.stringify(preference));
      } catch (err) {
        log.warn('browse', 'diet preference save failed', { key: STORAGE_KEY, error: String(err) });
      }
    },
  };
};
