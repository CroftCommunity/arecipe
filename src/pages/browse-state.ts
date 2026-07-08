// Browse-state core (pure): the heart of the Browse filtering feature. No DOM,
// no rendering, injectable storage — this is the TDD core consumed by the
// wiring phases (photos-only, view mode, facet dropdowns). Three concerns:
//   1. recipeFacets — derive a recipe's cuisine/category/diet/hasImage, with
//      normalization for the malformed wild records we can't edit (see below).
//   2. matchesFilter — evaluate a recipe against the transient filter state
//      plus the app-wide diet preference. OR within a dimension, AND across.
//   3. createBrowsePrefs — defensive persistence of the transient state.

import { log } from '../log.js';
import type { CachedRecipe } from '../recipes/cache.js';
import { firstImageCid } from '../recipes/present.js';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type ViewMode = 'tiles' | 'details';

/** A recipe's filterable facets, normalized for grouping/filtering. */
export type RecipeFacets = {
  cuisine: string | null;
  category: string | null;
  diet: string[];
  hasImage: boolean;
};

/** Transient per-browse state (NOT diet — that's the app-wide preference). */
export type BrowseState = {
  view: ViewMode;
  photosOnly: boolean;
  facets: { cuisine: string[]; category: string[] };
};

// Diet tokens arrive as either `exchange.recipe.defs#dietVegetarian` or a bare
// value; take the part after `#`. Some wild records carry a doubled suffix
// (`dietGlutenFreeDiet`, `dietLowCarbDiet`) — strip a trailing "Diet" so they
// group with the canonical `dietGlutenFree` / `dietLowCarb` tokens.
const normalizeDietToken = (raw: string): string => {
  const afterHash = raw.includes('#') ? raw.slice(raw.lastIndexOf('#') + 1) : raw;
  return afterHash.endsWith('Diet') ? afterHash.slice(0, -'Diet'.length) : afterHash;
};

// One wild record categorizes as "side dish" where the canonical value is
// "side"; canonicalize so it groups correctly (the owned copy is corrected at
// the source in Phase 9; foreign records rely on this normalization).
const normalizeCategory = (raw: string): string => (raw === 'side dish' ? 'side' : raw);

const trimmedString = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
};

export const recipeFacets = (value: Record<string, unknown>): RecipeFacets => {
  const cuisine = trimmedString(value['recipeCuisine']);
  const categoryRaw = trimmedString(value['recipeCategory']);
  const dietRaw = Array.isArray(value['suitableForDiet']) ? value['suitableForDiet'] : [];
  const diet = dietRaw
    .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    .map(normalizeDietToken);
  return {
    cuisine,
    category: categoryRaw === null ? null : normalizeCategory(categoryRaw),
    diet,
    hasImage: firstImageCid(value) !== null,
  };
};

/**
 * Does a recipe survive the current filter?
 * - photos-only: AND clause (recipe must have an image).
 * - transient facets: OR within a dimension, AND across dimensions.
 * - app-wide diet preference: recipe must satisfy EVERY selected diet token.
 */
export const matchesFilter = (
  value: Record<string, unknown>,
  opts: { state: BrowseState; diet: string[] },
): boolean => {
  const { state, diet } = opts;
  const facets = recipeFacets(value);

  if (state.photosOnly && !facets.hasImage) return false;

  if (
    state.facets.cuisine.length > 0 &&
    (facets.cuisine === null || !state.facets.cuisine.includes(facets.cuisine))
  ) {
    return false;
  }
  if (
    state.facets.category.length > 0 &&
    (facets.category === null || !state.facets.category.includes(facets.category))
  ) {
    return false;
  }

  if (diet.length > 0 && !diet.every((token) => facets.diet.includes(token))) return false;

  return true;
};

/** Distinct, sorted cuisine/category values present in the given entries. */
export const availableFacets = (
  entries: readonly CachedRecipe[],
): { cuisine: string[]; category: string[] } => {
  const cuisine = new Set<string>();
  const category = new Set<string>();
  for (const entry of entries) {
    const facets = recipeFacets(entry.value);
    if (facets.cuisine !== null) cuisine.add(facets.cuisine);
    if (facets.category !== null) category.add(facets.category);
  }
  return { cuisine: [...cuisine].sort(), category: [...category].sort() };
};

const VIEW_KEY = 'browse-view-mode';
const PHOTOS_KEY = 'browse-photos-only';
const FACETS_KEY = 'browse-facets';

const defaultState = (): BrowseState => ({
  view: 'tiles',
  photosOnly: false,
  facets: { cuisine: [], category: [] },
});

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export type BrowsePrefs = {
  load: () => BrowseState;
  save: (state: BrowseState) => void;
};

export const createBrowsePrefs = (opts: { storage?: StorageLike } = {}): BrowsePrefs => {
  const storage = opts.storage ?? window.localStorage;
  const readItem = (key: string): string | null => {
    try {
      return storage.getItem(key);
    } catch (err) {
      log.warn('browse', 'prefs load failed', { key, error: String(err) });
      return null;
    }
  };
  return {
    load: () => {
      const state = defaultState();
      const view = readItem(VIEW_KEY);
      if (view === 'tiles' || view === 'details') state.view = view;
      const photos = readItem(PHOTOS_KEY);
      if (photos !== null) state.photosOnly = photos === 'true';
      const facetsRaw = readItem(FACETS_KEY);
      if (facetsRaw !== null) {
        try {
          const parsed = JSON.parse(facetsRaw) as { cuisine?: unknown; category?: unknown };
          state.facets.cuisine = toStringArray(parsed.cuisine);
          state.facets.category = toStringArray(parsed.category);
        } catch (err) {
          log.warn('browse', 'facets parse failed', { key: FACETS_KEY, error: String(err) });
        }
      }
      return state;
    },
    save: (state) => {
      try {
        storage.setItem(VIEW_KEY, state.view);
        storage.setItem(PHOTOS_KEY, String(state.photosOnly));
        if (state.facets.cuisine.length === 0 && state.facets.category.length === 0) {
          storage.removeItem(FACETS_KEY);
        } else {
          storage.setItem(FACETS_KEY, JSON.stringify(state.facets));
        }
      } catch (err) {
        log.warn('browse', 'prefs save failed', { error: String(err) });
      }
    },
  };
};
