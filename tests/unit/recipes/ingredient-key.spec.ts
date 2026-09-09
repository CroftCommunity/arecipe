// Ingredient resolver core (plans/2026-08-12-1 Phase 2). Phase 0 measured why a
// raw parseIngredient().name is not a key: it is the whole TAIL of the line
// ("cloves garlic, minced", "(240 ml) milk", "salt to taste"), so the resolver
// owns three splits before any lookup — head phrase, count unit, descriptors —
// then looks the head up most-specific-first. Every case below is a real
// census line shape; "surfaced, never invented": no key is ever guessed.
import { describe, expect, it } from 'vitest';
import {
  canonicalHead,
  headPhrase,
  resolveIngredient,
  type Vocabulary,
} from '../../../src/recipes/ingredient-key.js';

const taxonomy = {
  variety: ['ground', 'smoked', 'black', 'white', 'brown', 'dried', 'all-purpose', 'unsalted', 'granulated', 'extra-virgin', 'kosher'],
  prep: ['chopped', 'minced', 'grated', 'beaten', 'freshly-ground', 'sifted', 'melted'],
  quality: ['large', 'medium', 'small', 'fresh', 'ripe'],
};

const vocab: Vocabulary = {
  descriptors: taxonomy,
  keys: {
    salt: { aliases: [] },
    pepper: { aliases: [] },
    'black pepper': { aliases: ['peppercorn'] },
    paprika: { aliases: [] },
    garlic: { aliases: [] },
    egg: { aliases: [] },
    flour: { aliases: [] },
    sugar: { aliases: [] },
    butter: { aliases: [] },
    milk: { aliases: [] },
    scallion: { aliases: ['green onion', 'spring onion'] },
    'bay leaf': { aliases: [] },
    'olive oil': { aliases: [] },
    parsley: { aliases: [] },
    bean: { aliases: [] },
  },
};

describe('headPhrase — the tail of a parsed name reduced to its head', () => {
  it.each([
    ['cloves garlic, minced', 'cloves garlic'],
    ['(240 ml) milk', 'milk'],
    ['salt to taste', 'salt'],
    ['salt, to taste', 'salt'],
    ['of salt', 'salt'],
    ['flour (for dusting)', 'flour'],
    ['butter, plus more for greasing', 'butter'],
    ['sugar - divided', 'sugar'],
    ['parsley for garnish', 'parsley'],
    ['eggs, beaten (optional)', 'eggs'],
    ['  Olive   Oil ', 'olive oil'],
  ])('%j → %j', (name, head) => {
    expect(headPhrase(name)).toBe(head);
  });
});

describe('canonicalHead — count units and descriptors come off, plurals fold', () => {
  it('strips a leading count unit and a following "of"', () => {
    expect(canonicalHead('2 cloves garlic, minced', taxonomy)).toMatchObject({ head: 'garlic', countUnit: 'clove', prep: [] });
    expect(canonicalHead('3 cloves of garlic', taxonomy)).toMatchObject({ head: 'garlic', countUnit: 'clove' });
    expect(canonicalHead('1 (15 oz) can black beans, drained', taxonomy)).toMatchObject({ head: 'bean', countUnit: 'can', variety: ['black'] });
    expect(canonicalHead('1 square chocolate (1 ounce)', taxonomy)).toMatchObject({ head: 'chocolate', countUnit: 'square' });
  });

  it('strips a trailing count unit when a head word precedes it', () => {
    expect(canonicalHead('4 garlic cloves', taxonomy)).toMatchObject({ head: 'garlic', countUnit: 'clove' });
  });

  it('splits leading descriptors by class and folds the head plural', () => {
    expect(canonicalHead('3 large eggs, beaten', taxonomy)).toMatchObject({ head: 'egg', quality: ['large'], prep: [] });
    expect(canonicalHead('1 tsp smoked paprika', taxonomy)).toMatchObject({ head: 'paprika', variety: ['smoked'] });
    expect(canonicalHead('freshly-ground black pepper', taxonomy)).toMatchObject({ head: 'pepper', variety: ['black'], prep: ['freshly-ground'] });
    expect(canonicalHead('2 cups white granulated sugar', taxonomy)).toMatchObject({ head: 'sugar', variety: ['white', 'granulated'] });
    expect(canonicalHead('chopped fresh parsley', taxonomy)).toMatchObject({ head: 'parsley', prep: ['chopped'], quality: ['fresh'] });
  });

  it('keeps the full descriptor-bearing head so a lookup can try it first', () => {
    expect(canonicalHead('freshly-ground black pepper', taxonomy)?.full).toBe('black pepper');
  });

  it('folds irregular plurals the parser folds wrong', () => {
    expect(canonicalHead('2 bay leaves', taxonomy)?.head).toBe('bay leaf');
    expect(canonicalHead('3 loaves bread', taxonomy)?.head).toBe('bread');
  });

  it('returns null for a line with no usable name', () => {
    expect(canonicalHead('½ tsp', taxonomy)).toBeNull();
    expect(canonicalHead('', taxonomy)).toBeNull();
  });
});

describe('resolveIngredient — most-specific head first, then descriptors peel off', () => {
  it('exact key on the full head, no descriptors', () => {
    expect(resolveIngredient('1 tsp salt', vocab)).toEqual({ method: 'exact', key: 'salt', head: 'salt', variety: [], prep: [], quality: [] });
  });

  it('a full head that is itself a key wins over peeling its descriptor', () => {
    const r = resolveIngredient('1 tsp black pepper', vocab);
    expect(r).toMatchObject({ method: 'exact', key: 'black pepper', variety: [] });
  });

  it('peels descriptors to reach a key and reports them', () => {
    expect(resolveIngredient('1 tsp smoked paprika', vocab)).toMatchObject({ method: 'exact', key: 'paprika', variety: ['smoked'] });
    expect(resolveIngredient('2 cups all-purpose flour, sifted', vocab)).toMatchObject({ method: 'exact', key: 'flour', variety: ['all-purpose'] });
    expect(resolveIngredient('3 large eggs, beaten', vocab)).toMatchObject({ method: 'exact', key: 'egg', quality: ['large'] });
  });

  it('resolves through an alias and says so', () => {
    expect(resolveIngredient('2 green onions, sliced', vocab)).toMatchObject({ method: 'alias', key: 'scallion', head: 'green onion' });
    expect(resolveIngredient('1 tbsp peppercorns', vocab)).toMatchObject({ method: 'alias', key: 'black pepper' });
  });

  it('a peeled descriptor that is part of the matched key is not reported as a variety', () => {
    const v: Vocabulary = { ...vocab, keys: { ...vocab.keys, 'ground beef': { aliases: ['hamburger'] } } };
    expect(resolveIngredient('1 lb ground hamburger', v)).toMatchObject({ method: 'alias', key: 'ground beef', variety: [] });
  });

  it('count units never block a match', () => {
    expect(resolveIngredient('2 cloves garlic, minced', vocab)).toMatchObject({ method: 'exact', key: 'garlic', countUnit: 'clove', prep: [] });
  });

  it('stays unmatched, loudly, when nothing in the vocabulary fits', () => {
    expect(resolveIngredient('1 cup dashi', vocab)).toEqual({ method: 'unmatched', name: 'dashi', head: 'dashi' });
    expect(resolveIngredient('juice of 1 lemon', vocab)).toMatchObject({ method: 'unmatched' });
  });

  it('an unparseable line is unmatched with its raw text as the name', () => {
    expect(resolveIngredient('½ tsp', vocab)).toEqual({ method: 'unmatched', name: '½ tsp', head: '' });
  });

  it('never matches an alias or key on a substring ("flour" must not claim "bread flour")', () => {
    expect(resolveIngredient('500 g bread flour', vocab)).toMatchObject({ method: 'unmatched', head: 'bread flour' });
  });
});

describe('resolveIngredient — the device-local overlay (Phase 6) comes first', () => {
  const overlay = (name: string): string | undefined =>
    ({ 'dashi stock': 'dashi', 'brown sugar': 'muscovado', 'freeze-dried strawberry': 'strawberry' })[name];
  const v: Vocabulary = { ...vocab, keys: { ...vocab.keys, dashi: { aliases: [] }, muscovado: { aliases: [] }, strawberry: { aliases: [] } } };

  it('an unmatched name the cook confirmed resolves through the overlay, labeled as such', () => {
    expect(resolveIngredient('4 cups dashi stock', v, { overlay })).toEqual({
      method: 'overlay', key: 'dashi', head: 'dashi stock', variety: [], prep: [], quality: [],
    });
  });

  it('the overlay is consulted by the identity-bearing name (variety kept), so prep and quantity never matter', () => {
    expect(resolveIngredient('30 g freeze-dried strawberries, crushed', v, { overlay })).toMatchObject({ method: 'overlay', key: 'strawberry' });
  });

  it('an overlay entry corrects the shipped baseline — overlay > baseline > unmatched', () => {
    expect(resolveIngredient('1 cup brown sugar', v)).toMatchObject({ method: 'exact', key: 'sugar', variety: ['brown'] });
    expect(resolveIngredient('1 cup brown sugar', v, { overlay })).toMatchObject({ method: 'overlay', key: 'muscovado' });
  });

  it('without an overlay nothing changes', () => {
    expect(resolveIngredient('4 cups dashi stock', v)).toMatchObject({ method: 'unmatched' });
  });
});
