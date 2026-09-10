// Substitution engine (plans/2026-08-12-1 Phase 4). Rules are keyed on the
// canonical vocabulary, never on raw text: a cook's "flour → almond flour"
// rewrites "2 cups flour" and leaves "500 g bread flour" alone, because
// `bread flour` is its own key. A rule scoped to a variety ({paprika, smoked})
// wins over a bare-key rule for the same key and touches only that variety.
// Curated rows from the reference chart are SUGGESTIONS beside a line, never a
// rewrite — they carry an amount and a "use", and nobody scales a ratio here.
import { describe, expect, it } from 'vitest';
import {
  curatedSubstitutions,
  keyCookSubstitution,
  lineSubstitution,
  substituteLine,
  substituteLines,
  type CookSubstitution,
} from '../../../src/recipes/substitutions.js';
import { INGREDIENT_VOCABULARY as vocab } from '../../../src/recipes/ingredient-vocabulary.js';

const rule = (from: string, to: string): CookSubstitution => {
  const r = keyCookSubstitution(from, to, vocab);
  if (r === null) throw new Error(`fixture: ${from} did not resolve`);
  return r;
};

describe('keyCookSubstitution — a cook types text, the rule is stored by key', () => {
  it('resolves the from-text to its key, through an alias when needed', () => {
    expect(keyCookSubstitution('ground hamburger', 'ground turkey', vocab)).toEqual({
      from: 'ground hamburger',
      fromKey: 'ground beef',
      to: 'ground turkey',
    });
  });

  it('keeps a variety the cook typed as the rule scope', () => {
    expect(keyCookSubstitution('smoked paprika', 'chipotle powder', vocab)).toEqual({
      from: 'smoked paprika',
      fromKey: 'paprika',
      variety: 'smoked',
      to: 'chipotle powder',
    });
  });

  it('refuses text the vocabulary does not know — a rule that can never match is not stored', () => {
    expect(keyCookSubstitution('xyzzy powder', 'anything', vocab)).toBeNull();
    expect(keyCookSubstitution('', 'anything', vocab)).toBeNull();
    expect(keyCookSubstitution('flour', '  ', vocab)).toBeNull();
  });
});

describe('substituteLine — a cook rule rewrites the matched head, keeping quantity, unit and prep', () => {
  it('rewrites the head and keeps the rest of the line verbatim', () => {
    expect(substituteLine('1 lb ground hamburger', [rule('ground hamburger', 'ground turkey')], vocab)).toEqual({
      kind: 'swap',
      original: '1 lb ground hamburger',
      substituted: '1 lb ground turkey',
      from: 'ground hamburger',
      to: 'ground turkey',
    });
    expect(substituteLine('2 cups flour, sifted', [rule('flour', 'almond flour')], vocab)?.substituted).toBe('2 cups almond flour, sifted');
  });

  it('never matches by substring: a flour rule leaves bread flour alone', () => {
    expect(substituteLine('500 g bread flour', [rule('flour', 'almond flour')], vocab)).toBeNull();
  });

  it('a bare-key rule keeps the line’s variety word; a variety-scoped rule replaces it and touches only that variety', () => {
    expect(substituteLine('1 tsp smoked paprika', [rule('paprika', 'chili powder')], vocab)?.substituted).toBe('1 tsp smoked chili powder');
    const scoped = [rule('smoked paprika', 'chipotle powder')];
    expect(substituteLine('1 tsp smoked paprika', scoped, vocab)?.substituted).toBe('1 tsp chipotle powder');
    expect(substituteLine('1 tsp paprika', scoped, vocab)).toBeNull();
  });

  it('the variety-scoped rule wins over the bare-key rule for the same key', () => {
    const rules = [rule('paprika', 'chili powder'), rule('smoked paprika', 'chipotle powder')];
    expect(substituteLine('1 tsp smoked paprika', rules, vocab)?.to).toBe('chipotle powder');
    expect(substituteLine('1 tsp paprika', rules, vocab)?.to).toBe('chili powder');
  });

  it('follows the line’s plural when the head was plural', () => {
    expect(substituteLine('2 green onions, sliced', [rule('scallion', 'leek')], vocab)?.substituted).toBe('2 leeks, sliced');
  });

  it('an unmatched line, or no rules, is null', () => {
    expect(substituteLine('1 cup quuxwater', [rule('flour', 'almond flour')], vocab)).toBeNull();
    expect(substituteLine('2 cups flour', [], vocab)).toBeNull();
  });
});

describe('curated substitutions from the reference chart', () => {
  it('every reference row resolves to a key — the chart and the vocabulary agree', () => {
    const curated = curatedSubstitutions(vocab);
    expect(curated.length).toBe(7);
    for (const c of curated) expect(vocab.keys[c.from.key]).toBeDefined();
  });

  it('suggests beside a line, without rewriting it, and a cook swap wins over a suggestion', () => {
    const curated = curatedSubstitutions(vocab);
    expect(lineSubstitution('1 tablespoon cornstarch', { rules: [], curated, vocab })).toEqual({
      kind: 'suggestion',
      original: '1 tablespoon cornstarch',
      forAmount: '1 tablespoon cornstarch (for thickening)',
      use: '2 tablespoons flour',
    });
    expect(lineSubstitution('1 cup milk', { rules: [rule('milk', 'oat milk')], curated, vocab })?.kind).toBe('swap');
    expect(lineSubstitution('1 cup quuxwater', { rules: [], curated, vocab })).toBeNull();
  });
});

describe('substituteLines — the shopping list applies cook swaps only', () => {
  it('rewrites matched lines, leaves the rest, and is the identity with no rules', () => {
    const lines = ['2 cups flour', '500 g bread flour', '1 tablespoon cornstarch'];
    expect(substituteLines(lines, [rule('flour', 'almond flour')], vocab)).toEqual(['2 cups almond flour', '500 g bread flour', '1 tablespoon cornstarch']);
    expect(substituteLines(lines, [], vocab)).toBe(lines);
  });
});

describe('cook rules reach lines the overlay resolves (Phase 6)', () => {
  it('swaps a line that only resolves through a confirmed correction', () => {
    const overlay = (name: string): string | undefined => (name === 'freeze-dried strawberry' ? 'strawberry' : undefined);
    const rules = [rule('strawberry', 'raspberry')];
    expect(substituteLine('30 g freeze-dried strawberries', rules, vocab)).toBeNull();
    expect(substituteLine('30 g freeze-dried strawberries', rules, vocab, { overlay })?.substituted).toBe('30 g raspberries');
  });
});
