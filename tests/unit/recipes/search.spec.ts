// Pure-core full-text search (recipe-text-search plan, Phase 1). MiniSearch over
// the in-memory CachedRecipe feed: defensive open-world extraction, per-field
// boosting (name > ingredients > text > instructions), AND semantics, prefix +
// fuzzy tolerance, and empty-query identity. No DOM — the page wiring is guarded
// by e2e. Fixtures are built before the features that consume them.
import { describe, expect, it } from 'vitest';
import { createRecipeSearch, createSearchMemo, queryEntries } from '../../../src/recipes/search.js';
import { collapseVersions } from '../../../src/recipes/model.js';
import { matchesFilter, type BrowseState } from '../../../src/pages/browse-state.js';
import type { CachedRecipe } from '../../../src/recipes/cache.js';

const cached = (value: Record<string, unknown>, rkey: string): CachedRecipe => ({
  uri: `at://did:plc:x/exchange.recipe.recipe/${rkey}`,
  cid: `cid-${rkey}`,
  value,
  verified: true,
  cachedAt: '2026-07-15T00:00:00Z',
});

const recipe = (
  over: Partial<{
    name: string;
    text: string;
    ingredients: unknown;
    instructions: unknown;
    recipeCuisine: string;
    recipeCategory: string;
    versionLabel: string;
    funFacts: unknown;
    funFact: unknown;
    dishKey: string;
    primaryVersion: boolean;
  }>,
  rkey: string,
): CachedRecipe => {
  const value: Record<string, unknown> = {
    name: over.name ?? 'Untitled',
    text: over.text ?? '',
    ingredients: over.ingredients ?? [],
    instructions: over.instructions ?? [],
    createdAt: '2026-07-15T00:00:00Z',
    updatedAt: '2026-07-15T00:00:00Z',
  };
  for (const k of ['recipeCuisine', 'recipeCategory', 'versionLabel', 'dishKey'] as const) {
    if (over[k] !== undefined) value[k] = over[k];
  }
  if (over.primaryVersion !== undefined) value['primaryVersion'] = over.primaryVersion;
  if (over.funFacts !== undefined) value['funFacts'] = over.funFacts;
  if (over.funFact !== undefined) value['funFact'] = over.funFact;
  return cached(value, rkey);
};

const names = (entries: CachedRecipe[]): string[] => entries.map((e) => String(e.value['name']));

describe('createRecipeSearch — extraction (open-world, defensive)', () => {
  it('indexes a record missing ingredients / funFacts / etc. without throwing', () => {
    const bare = cached(
      { name: 'Bare Bones', text: 'plain', createdAt: 'x', updatedAt: 'y' },
      'bare',
    );
    const search = createRecipeSearch([bare]);
    expect(names(search.query('bare'))).toEqual(['Bare Bones']);
    expect(names(search.query('plain'))).toEqual(['Bare Bones']);
  });

  it('reads mistyped fields (ingredients: 42) as empty rather than throwing', () => {
    const mistyped = recipe({ name: 'Mistyped', ingredients: 42, instructions: null }, 'mis');
    const search = createRecipeSearch([mistyped]);
    // Indexing does not throw and the name is still searchable.
    expect(names(search.query('mistyped'))).toEqual(['Mistyped']);
  });

  it('includes the legacy singular funFact string in the index', () => {
    const legacy = recipe({ name: 'Legacy', funFact: 'contains pistachio dust' }, 'leg');
    const search = createRecipeSearch([legacy]);
    expect(names(search.query('pistachio'))).toEqual(['Legacy']);
  });

  it('indexes the normalized cuisine/category as free text (thai works)', () => {
    const thai = recipe({ name: 'Noodles', recipeCuisine: 'thai', recipeCategory: 'dinner' }, 'thai');
    const other = recipe({ name: 'Toast', recipeCuisine: 'british' }, 'toast');
    const search = createRecipeSearch([thai, other]);
    expect(names(search.query('thai'))).toEqual(['Noodles']);
  });
});

describe('createRecipeSearch — ranking + reach', () => {
  it('scores a name match above a body-only (instructions) match for the same term', () => {
    const inName = recipe({ name: 'Saffron Rice', instructions: ['boil'] }, 'a');
    const inInstructions = recipe({ name: 'Plain Rice', instructions: ['add saffron at the end'] }, 'b');
    const search = createRecipeSearch([inInstructions, inName]); // input order body-first
    expect(names(search.query('saffron'))).toEqual(['Saffron Rice', 'Plain Rice']);
  });

  it('finds a recipe by a term present ONLY in its ingredients', () => {
    const withFeta = recipe({ name: 'Village Salad', ingredients: ['cucumber', 'feta', 'olive'] }, 'feta');
    const noFeta = recipe({ name: 'Fruit Bowl', ingredients: ['apple', 'pear'] }, 'nofeta');
    const search = createRecipeSearch([withFeta, noFeta]);
    expect(names(search.query('feta'))).toEqual(['Village Salad']);
  });
});

describe('createRecipeSearch — query semantics', () => {
  it('AND: multi-term query returns only recipes matching every term', () => {
    const both = recipe({ name: 'Chicken Lemon Skillet', ingredients: ['chicken', 'lemon'] }, 'both');
    const chickenOnly = recipe({ name: 'Roast Chicken', ingredients: ['chicken'] }, 'ch');
    const lemonOnly = recipe({ name: 'Lemon Tart', ingredients: ['lemon'] }, 'le');
    const search = createRecipeSearch([both, chickenOnly, lemonOnly]);
    expect(names(search.query('chicken lemon'))).toEqual(['Chicken Lemon Skillet']);
  });

  it('fuzzy: a one-edit typo (brocolli) matches broccoli', () => {
    const soup = recipe({ name: 'Green Soup', ingredients: ['broccoli', 'stock'] }, 'soup');
    const search = createRecipeSearch([soup]);
    expect(names(search.query('brocolli'))).toEqual(['Green Soup']);
  });

  it('prefix: a partial term (pancak) matches Pancakes', () => {
    const pancakes = recipe({ name: 'American Pancakes' }, 'pan');
    const search = createRecipeSearch([pancakes]);
    expect(names(search.query('pancak'))).toEqual(['American Pancakes']);
  });
});

describe('createRecipeSearch — identity + lifecycle', () => {
  const a = recipe({ name: 'First', ingredients: ['salt'] }, 'a');
  const b = recipe({ name: 'Second', ingredients: ['sugar'] }, 'b');
  const c = recipe({ name: 'Third', ingredients: ['pepper'] }, 'c');

  it('empty query returns the input entries in unchanged order', () => {
    const search = createRecipeSearch([a, b, c]);
    expect(search.query('')).toEqual([a, b, c]);
  });

  it('whitespace-only query returns the input entries in unchanged order', () => {
    const search = createRecipeSearch([a, b, c]);
    expect(search.query('   \t ')).toEqual([a, b, c]);
  });

  it('a fresh searcher over a new entries array reflects the new set', () => {
    const first = createRecipeSearch([a, b]);
    expect(names(first.query('salt'))).toEqual(['First']);
    const second = createRecipeSearch([c]);
    expect(names(second.query('salt'))).toEqual([]); // old entry gone
    expect(names(second.query('pepper'))).toEqual(['Third']); // new entry searchable
  });
});

describe('createSearchMemo — identity memoization', () => {
  it('reuses the searcher for the same entries reference, rebuilds for a new one', () => {
    let builds = 0;
    const memo = createSearchMemo((entries) => {
      builds += 1;
      return createRecipeSearch(entries);
    });
    const arr = [recipe({ name: 'One', ingredients: ['thyme'] }, 'a')];
    memo(arr);
    memo(arr); // same reference — no rebuild
    expect(builds).toBe(1);
    memo([...arr]); // new reference — rebuild
    expect(builds).toBe(2);
  });
});

// Phase 2 — the composition seam both pages share: query runs AFTER facets and
// BEFORE collapseVersions (D5), over a whole-feed index memoized on identity (D6).
const baseState = (over: Partial<BrowseState> = {}): BrowseState => ({
  view: 'tiles',
  photosOnly: false,
  facets: { cuisine: [], category: [] },
  ...over,
});

describe('queryEntries — composition with collapseVersions', () => {
  it('surfaces the primary card when only a non-primary version’s content matches', () => {
    // Two versions of one dish share dishKey "beef-stew". Only the NON-primary
    // version carries feta; the primary does not. A "feta" query must still make
    // the dish surface, and collapse must yield the PRIMARY as the representative.
    const primary = recipe(
      { name: 'Beef Stew', ingredients: ['beef', 'carrot'], dishKey: 'beef-stew', primaryVersion: true },
      'stew-primary',
    );
    const variant = recipe(
      { name: 'Beef Stew (Greek)', ingredients: ['beef', 'feta'], dishKey: 'beef-stew' },
      'stew-variant',
    );
    const feed = [primary, variant];
    const searcher = createRecipeSearch(feed);
    const queried = queryEntries(searcher, 'feta', feed);
    // Both versions of the dish are carried through so collapse sees the primary.
    expect(queried.map((e) => e.uri).sort()).toEqual([primary.uri, variant.uri].sort());
    const { representatives } = collapseVersions(queried);
    expect(representatives.map((e) => e.uri)).toEqual([primary.uri]);
  });
});

describe('queryEntries — composition with facets', () => {
  it('applies the facet filter first, then the query (both narrow the result)', () => {
    // Greek lemon bowl, an Italian lemon risotto (matches the query but wrong
    // cuisine), and a Greek feta salad (right cuisine, wrong query).
    const bowl = recipe(
      { name: 'Greek Lunch Bowl', ingredients: ['chickpeas', 'lemon'], recipeCuisine: 'greek' },
      'bowl',
    );
    const risotto = recipe(
      { name: 'Lemon Risotto', ingredients: ['rice', 'lemon'], recipeCuisine: 'italian' },
      'risotto',
    );
    const salad = recipe(
      { name: 'Greek Salad', ingredients: ['cucumber', 'feta'], recipeCuisine: 'greek' },
      'salad',
    );
    const feed = [bowl, risotto, salad];
    const searcher = createRecipeSearch(feed); // indexed over the WHOLE feed
    const greek = baseState({ facets: { cuisine: ['greek'], category: [] } });
    const candidates = feed.filter((e) => matchesFilter(e.value, { state: greek, diet: [] }));
    // Facet greek → {bowl, salad}; then query lemon → only the bowl survives.
    const shown = queryEntries(searcher, 'lemon', candidates);
    expect(shown.map((e) => e.uri)).toEqual([bowl.uri]);
  });

  it('empty query is identity over the candidates (facet order preserved)', () => {
    const a = recipe({ name: 'A', recipeCuisine: 'greek' }, 'a');
    const b = recipe({ name: 'B', recipeCuisine: 'greek' }, 'b');
    const feed = [a, b];
    const searcher = createRecipeSearch(feed);
    expect(queryEntries(searcher, '   ', feed)).toEqual([a, b]);
  });
});
