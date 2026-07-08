// Browse-state core (pure): facet extraction (with normalization of the wild
// malformed records we can't edit), the filter predicate (OR-within-dimension
// / AND-across-dimensions, photos-only, app-wide diet preference), the
// available-facets derivation, and defensive prefs persistence. No DOM.
import { describe, expect, it } from 'vitest';
import {
  availableFacets,
  createBrowsePrefs,
  matchesFilter,
  recipeFacets,
  type BrowseState,
} from '../../../src/pages/browse-state.js';
import type { CachedRecipe } from '../../../src/recipes/cache.js';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
};

const brokenStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

// Factory: a recipe record value with only the facet fields we care about.
const recipeValue = (
  over: { cuisine?: string; category?: string; diet?: string[]; image?: boolean } = {},
): Record<string, unknown> => {
  const value: Record<string, unknown> = {};
  if (over.cuisine !== undefined) value['recipeCuisine'] = over.cuisine;
  if (over.category !== undefined) value['recipeCategory'] = over.category;
  if (over.diet !== undefined) value['suitableForDiet'] = over.diet;
  if (over.image === true) value['embed'] = { images: [{ image: { ref: { $link: 'bafyimg' } } }] };
  return value;
};

const cached = (
  value: Record<string, unknown>,
  uri = 'at://did:plc:x/exchange.recipe.recipe/1',
): CachedRecipe => ({ uri, cid: 'cid', value, verified: true, cachedAt: '2026-07-08T00:00:00Z' });

const baseState = (over: Partial<BrowseState> = {}): BrowseState => ({
  view: 'tiles',
  photosOnly: false,
  facets: { cuisine: [], category: [] },
  ...over,
});

describe('recipeFacets', () => {
  it('extracts cuisine, category, diet tokens, and image presence', () => {
    const f = recipeFacets(
      recipeValue({
        cuisine: 'italian',
        category: 'dinner',
        diet: ['exchange.recipe.defs#dietVegetarian'],
        image: true,
      }),
    );
    expect(f).toEqual({
      cuisine: 'italian',
      category: 'dinner',
      diet: ['dietVegetarian'],
      hasImage: true,
    });
  });

  it('returns nulls/empties for a record with no facet metadata and no image', () => {
    expect(recipeFacets(recipeValue())).toEqual({
      cuisine: null,
      category: null,
      diet: [],
      hasImage: false,
    });
  });

  it('normalizes the doubled "…Diet" suffix on wild records (both #-prefixed and bare)', () => {
    const f = recipeFacets(
      recipeValue({ diet: ['exchange.recipe.defs#dietGlutenFreeDiet', 'dietLowCarbDiet'] }),
    );
    expect(f.diet).toEqual(['dietGlutenFree', 'dietLowCarb']);
  });

  it('canonicalizes the malformed "side dish" category to "side"', () => {
    expect(recipeFacets(recipeValue({ category: 'side dish' })).category).toBe('side');
  });
});

describe('matchesFilter', () => {
  const veg = recipeValue({
    cuisine: 'greek',
    category: 'dinner',
    diet: ['exchange.recipe.defs#dietVegetarian'],
    image: true,
  });
  const meat = recipeValue({ cuisine: 'american', category: 'breakfast', diet: [], image: false });

  it('empty state matches everything', () => {
    expect(matchesFilter(veg, { state: baseState(), diet: [] })).toBe(true);
    expect(matchesFilter(meat, { state: baseState(), diet: [] })).toBe(true);
  });

  it('single dimension: OR within — matches any selected value', () => {
    const state = baseState({ facets: { cuisine: ['greek', 'italian'], category: [] } });
    expect(matchesFilter(veg, { state, diet: [] })).toBe(true); // greek ∈ {greek, italian}
    expect(matchesFilter(meat, { state, diet: [] })).toBe(false); // american ∉
  });

  it('cross dimension: AND across — must match every selected dimension', () => {
    const mismatch = baseState({ facets: { cuisine: ['greek'], category: ['breakfast'] } });
    expect(matchesFilter(veg, { state: mismatch, diet: [] })).toBe(false); // greek ok, dinner ≠ breakfast
    const match = baseState({ facets: { cuisine: ['greek'], category: ['dinner'] } });
    expect(matchesFilter(veg, { state: match, diet: [] })).toBe(true);
  });

  it('photos-only excludes image-less recipes', () => {
    const state = baseState({ photosOnly: true });
    expect(matchesFilter(veg, { state, diet: [] })).toBe(true);
    expect(matchesFilter(meat, { state, diet: [] })).toBe(false);
  });

  it('diet preference intersects: a vegetarian preference drops non-vegetarian recipes', () => {
    expect(matchesFilter(veg, { state: baseState(), diet: ['dietVegetarian'] })).toBe(true);
    expect(matchesFilter(meat, { state: baseState(), diet: ['dietVegetarian'] })).toBe(false);
  });

  it('diet preference is AND across tokens — must satisfy every selected token', () => {
    const vegan = recipeValue({
      diet: ['exchange.recipe.defs#dietVegetarian', 'exchange.recipe.defs#dietVegan'],
    });
    expect(matchesFilter(vegan, { state: baseState(), diet: ['dietVegetarian', 'dietVegan'] })).toBe(
      true,
    );
    // veg is vegetarian but not vegan → fails the two-token preference.
    expect(matchesFilter(veg, { state: baseState(), diet: ['dietVegetarian', 'dietVegan'] })).toBe(
      false,
    );
  });
});

describe('availableFacets', () => {
  it('returns distinct, sorted cuisine and category values, ignoring nulls', () => {
    const entries = [
      cached(recipeValue({ cuisine: 'italian', category: 'dinner' })),
      cached(recipeValue({ cuisine: 'greek', category: 'dinner' })),
      cached(recipeValue({ cuisine: 'italian' })), // duplicate cuisine, no category
      cached(recipeValue({})), // no facets at all
    ];
    expect(availableFacets(entries)).toEqual({
      cuisine: ['greek', 'italian'],
      category: ['dinner'],
    });
  });
});

describe('createBrowsePrefs', () => {
  it('defaults to tiles / photos-off / no facets', () => {
    expect(createBrowsePrefs({ storage: memoryStorage() }).load()).toEqual(baseState());
  });

  it('round-trips view mode, photos-only, and facets', () => {
    const storage = memoryStorage();
    const state = baseState({
      view: 'details',
      photosOnly: true,
      facets: { cuisine: ['greek'], category: ['dinner'] },
    });
    createBrowsePrefs({ storage }).save(state);
    expect(createBrowsePrefs({ storage }).load()).toEqual(state);
  });

  it('degrades to defaults when storage throws (private mode)', () => {
    const prefs = createBrowsePrefs({ storage: brokenStorage });
    expect(prefs.load()).toEqual(baseState());
    expect(() => prefs.save(baseState({ view: 'details' }))).not.toThrow();
  });
});
