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
  resolveLine,
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

describe('head hygiene the corpus battle-test exposed (2026-09-14)', () => {
  const v: Vocabulary = { ...vocab, keys: { ...vocab.keys, 'tomato paste': { aliases: [] }, 'sour cream': { aliases: [] }, water: { aliases: [] }, basil: { aliases: [] }, thyme: { aliases: [] }, onion: { aliases: [] }, 'chicken broth': { aliases: [] } } };
  const t = { ...taxonomy, variety: [...taxonomy.variety, 'red'], prep: [...taxonomy.prep, 'sliced', 'warm'] };
  const vv: Vocabulary = { ...v, descriptors: t };

  it.each([
    ['/ 3 cups all-purpose flour', 'flour'], // stray punctuation + a unit with the quantity lost
    ['tbsp tomato paste', 'tomato paste'], // a unit with no quantity before it
    ['dl sour cream', 'sour cream'],
    ['quarts warm water', 'water'],
    ['leaves of fresh basil', 'basil'], // "leaves of" counts, it is not the ingredient
    ['a few sprigs thyme', 'thyme'],
    ['<bdi>1 cup</bdi> chicken broth', 'chicken broth'], // markup that leaked from the source
    ['red onion sliced', 'onion'], // trailing prep without a comma
  ])('%j → %j', (raw, key) => {
    expect(resolveIngredient(raw, vv)).toMatchObject({ key });
  });

  it('"bay leaves" keeps its leaf — "leaves" only counts at the front', () => {
    expect(resolveIngredient('2 bay leaves', vv)).toMatchObject({ key: 'bay leaf' });
  });

  it('trailing prep is peeled and reported', () => {
    expect(resolveIngredient('red onion sliced', vv)).toMatchObject({ key: 'onion', variety: ['red'], prep: ['sliced'] });
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

describe('Phase 5 — compound lines: derived forms, coordination, alternatives', () => {
  const v: Vocabulary = {
    ...vocab,
    keys: {
      ...vocab.keys,
      'lemon juice': { aliases: [] },
      'lemon zest': { aliases: [] },
      'lime juice': { aliases: [] },
      'orange zest': { aliases: [] },
      water: { aliases: [] },
      'vegetable broth': { aliases: ['vegetable stock'] },
      cilantro: { aliases: [] },
    },
  };

  it('"juice of 1 lemon" is lemon juice; "zest of" likewise — the derived form names the ingredient', () => {
    expect(resolveIngredient('Juice of 1 lemon', v)).toMatchObject({ method: 'exact', key: 'lemon juice' });
    expect(resolveIngredient('Freshly squeezed juice of 2 lemons', v)).toMatchObject({ method: 'exact', key: 'lemon juice' });
    expect(resolveIngredient('Juice of half a lemon', v)).toMatchObject({ method: 'exact', key: 'lemon juice' });
    expect(resolveIngredient('Grated zest of 1 orange', v)).toMatchObject({ method: 'exact', key: 'orange zest' });
    expect(resolveIngredient('Zest of 1 lemon, finely grated', v)).toMatchObject({ method: 'exact', key: 'lemon zest' });
  });

  it('"salt and pepper" is two ingredients: resolveLine splits them, resolveIngredient answers the first', () => {
    const line = resolveLine('Salt and pepper to taste', v);
    expect(line.joiner).toBe('and');
    expect(line.parts.map((p) => (p.method === 'unmatched' ? null : p.key))).toEqual(['salt', 'pepper']);
    expect(resolveIngredient('Salt and pepper to taste', v)).toMatchObject({ method: 'exact', key: 'salt' });
  });

  it('a line WITH a quantity is never split on "and" — "2 cups flour and sugar" is one unresolved thing', () => {
    const line = resolveLine('2 cups flour and sugar', v);
    expect(line.joiner).toBeUndefined();
    expect(line.parts).toHaveLength(1);
    expect(line.parts[0]).toMatchObject({ method: 'unmatched', name: 'flour and sugar' });
  });

  it('"X or Y": the first is what the author uses, the rest are alternatives', () => {
    const line = resolveLine('2 cups vegetable broth or water', v);
    expect(line.joiner).toBe('or');
    expect(line.parts.map((p) => (p.method === 'unmatched' ? null : p.key))).toEqual(['vegetable broth', 'water']);
    expect(resolveIngredient('2 cups vegetable broth or water', v)).toMatchObject({ method: 'exact', key: 'vegetable broth' });
    expect(resolveLine('Fresh cilantro or parsley, chopped, for garnish', v).parts.map((p) => (p.method === 'unmatched' ? null : p.key))).toEqual(['cilantro', 'parsley']);
  });

  it('"chicken or vegetable broth" shares its noun: the first part borrows the tail when that names a key', () => {
    const v3: Vocabulary = { ...v, keys: { ...v.keys, 'chicken broth': { aliases: [] }, chicken: { aliases: [] }, 'olive oil': { aliases: [] } } };
    expect(resolveLine('2 cups chicken or vegetable broth', v3).parts.map((p) => (p.method === 'unmatched' ? null : p.key))).toEqual(['chicken broth', 'vegetable broth']);
    // …but never when the borrowed phrase is not a thing: "butter or olive oil" stays butter + olive oil
    expect(resolveLine('2 tbsp butter or olive oil', v3).parts.map((p) => (p.method === 'unmatched' ? null : p.key))).toEqual(['butter', 'olive oil']);
  });

  it('a whole compound head the vocabulary knows is never split', () => {
    const v2: Vocabulary = { ...v, keys: { ...v.keys, 'sweet and sour sauce': { aliases: [] } } };
    const line = resolveLine('2 tbsp sweet and sour sauce', v2);
    expect(line.joiner).toBeUndefined();
    expect(line.parts).toEqual([expect.objectContaining({ method: 'exact', key: 'sweet and sour sauce' })]);
  });

  it('when no part resolves, the line stays unmatched as a whole — never split into two guesses', () => {
    const line = resolveLine('quux and quuux', v);
    expect(line.joiner).toBeUndefined();
    expect(line.parts).toEqual([{ method: 'unmatched', name: 'quux and quuux', head: 'quux and quuux' }]);
  });
});

describe('vocabulary review pass (2026-09-14): the line shapes that grew junk keys', () => {
  const v: Vocabulary = { ...vocab, keys: { ...vocab.keys, ginger: { aliases: [] }, saffron: { aliases: [] }, shrimp: { aliases: ['prawn'] }, chicken: { aliases: [] }, 'vegetable oil': { aliases: [] }, rice: { aliases: [] }, 'chicken breast': { aliases: [] }, cauliflower: { aliases: [] } } };
  const t = { ...taxonomy, variety: [...taxonomy.variety, 'broiler', 'fryer'], prep: [...taxonomy.prep, 'thumb-sized', 'heaping'], quality: [...taxonomy.quality, 'other'] };
  const vv: Vocabulary = { ...v, descriptors: t };

  it.each([
    ['&frac12; cup flour', 'flour'], // an HTML entity for ½ that leaked from a source
    ['frac14 tsp salt', 'salt'],
    ['1 cup lime juice )', 'lime juice'], // a stray closing paren
    ['thumb-sized piece of ginger', 'ginger'], // a count word behind a descriptor
    ['1 heaping teaspoon salt', 'salt'], // a measure word behind a descriptor
    ['3 strands of saffron', 'saffron'],
    ['2 chicken breast halves', 'chicken breast'],
    ['1 head cauliflower florets', 'cauliflower'],
    ['other vegetable oil', 'vegetable oil'],
  ])('%j → %j', (raw, key) => {
    const vvv: Vocabulary = { ...vv, keys: { ...vv.keys, 'lime juice': { aliases: [] } } };
    expect(resolveIngredient(raw, vvv)).toMatchObject({ key });
  });

  it('a slash is an alternative: "prawns/shrimp" and "broiler/fryer chicken" resolve like "or" lines', () => {
    expect(resolveLine('500 g prawns/shrimp', vv).parts.map((p) => (p.method === 'unmatched' ? null : p.key))).toEqual(['shrimp', 'shrimp']);
    expect(resolveIngredient('1 broiler/fryer chicken', vv)).toMatchObject({ key: 'chicken' });
  });
});
