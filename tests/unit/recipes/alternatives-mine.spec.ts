// Mining the corpus's "X or Y" lines (plans/2026-08-12-1, Phase 5b): an
// author who writes "2 cups vegetable broth or water" has told us a
// substitution they actually use, keyed to a real recipe. Mined pairs become a
// second curated source of suggestions beside the reference chart's seven rows.
// Counted by line weight; directed as written (the first is what they use).
import { describe, expect, it } from 'vitest';
import { mineAlternatives } from '../../../src/recipes/alternatives-mine.js';
import { INGREDIENT_VOCABULARY as vocab } from '../../../src/recipes/ingredient-vocabulary.js';

const rows: [string, number][] = [
  ['2 cups vegetable broth or water', 4],
  ['1 cup vegetable broth or water', 3],
  ['½ cup butter or margarine', 4],
  ['Fresh cilantro or parsley, chopped, for garnish', 16],
  ['1 teaspoon salt or to taste', 6], // "or to taste" is a tail, not an alternative
  ['2 tbsp quuxfat or butter', 2], // the first does not resolve → no pair
  ['2 cups flour', 30],
];

describe('mineAlternatives', () => {
  it('pairs the first resolved part with each later one, summed by line weight, sorted', () => {
    const { pairs } = mineAlternatives(rows, { vocab, minLines: 1 });
    expect(pairs.slice(0, 3)).toEqual([
      { from: 'cilantro', use: 'parsley', lines: 16 },
      { from: 'vegetable broth', use: 'water', lines: 7 },
      { from: 'butter', use: 'margarine', lines: 4 },
    ]);
  });

  it('a tail phrase like "or to taste" and an unresolved first part yield nothing', () => {
    const { pairs } = mineAlternatives(rows, { vocab, minLines: 1 });
    expect(pairs.find((p) => p.from === 'salt')).toBeUndefined();
    expect(pairs.find((p) => p.use === 'butter')).toBeUndefined();
  });

  it('applies the line floor', () => {
    const { pairs } = mineAlternatives(rows, { vocab, minLines: 5 });
    expect(pairs.map((p) => p.from)).toEqual(['cilantro', 'vegetable broth']);
  });
});
