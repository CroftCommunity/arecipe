// Phase 1 (recipe-model-extensions): the open-world extension fields arecipe
// layers on exchange.recipe.recipe — dishKey, versionLabel, primaryVersion,
// funFacts[]. These are read DEFENSIVELY from a record value whose extra
// fields are `unknown` (open-world), so every accessor must tolerate missing,
// null, mistyped, or legacy-shaped data without throwing. Old records (only
// the required fields) must read cleanly as "no extensions".
import { describe, expect, it } from 'vitest';
import {
  dishKeyOf,
  extensionsOf,
  funFactsOf,
  isPrimaryVersion,
  versionLabelOf,
} from '../../../src/recipes/model.js';

// A minimal valid record value (old-world: no extension fields).
const bare = (): Record<string, unknown> => ({
  name: 'Banana Bread',
  text: 'A loaf.',
  ingredients: ['banana'],
  instructions: ['bake'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('funFactsOf', () => {
  it('returns valid {text, source?} entries from a funFacts array', () => {
    const facts = [{ text: 'a', source: 'src' }, { text: 'b' }];
    expect(funFactsOf({ ...bare(), funFacts: facts })).toEqual(facts);
  });

  it('drops entries whose text is missing or not a string', () => {
    const value = { ...bare(), funFacts: [{ text: 'keep' }, { source: 'no text' }, { text: 42 }] };
    expect(funFactsOf(value)).toEqual([{ text: 'keep' }]);
  });

  it('drops a non-string source but keeps the fact', () => {
    expect(funFactsOf({ ...bare(), funFacts: [{ text: 'x', source: 99 }] })).toEqual([{ text: 'x' }]);
  });

  it('falls back to a legacy singular funFact string when funFacts is absent', () => {
    expect(funFactsOf({ ...bare(), funFact: 'legacy fact' })).toEqual([{ text: 'legacy fact' }]);
  });

  it('returns [] for a non-array funFacts, and [] when neither field is present', () => {
    expect(funFactsOf({ ...bare(), funFacts: 'nope' })).toEqual([]);
    expect(funFactsOf(bare())).toEqual([]);
  });
});

describe('dishKeyOf / versionLabelOf', () => {
  it('returns the trimmed string when present', () => {
    expect(dishKeyOf({ ...bare(), dishKey: ' banana-bread ' })).toBe('banana-bread');
    expect(versionLabelOf({ ...bare(), versionLabel: 'Frugal' })).toBe('Frugal');
  });

  it('returns undefined for empty/whitespace, non-string, or missing', () => {
    expect(dishKeyOf({ ...bare(), dishKey: '   ' })).toBeUndefined();
    expect(dishKeyOf({ ...bare(), dishKey: 123 })).toBeUndefined();
    expect(dishKeyOf(bare())).toBeUndefined();
    expect(versionLabelOf(bare())).toBeUndefined();
  });
});

describe('isPrimaryVersion', () => {
  it('is true only for the literal boolean true', () => {
    expect(isPrimaryVersion({ ...bare(), primaryVersion: true })).toBe(true);
  });

  it('is false for false, truthy non-true values, and missing', () => {
    expect(isPrimaryVersion({ ...bare(), primaryVersion: false })).toBe(false);
    expect(isPrimaryVersion({ ...bare(), primaryVersion: 'yes' })).toBe(false);
    expect(isPrimaryVersion(bare())).toBe(false);
  });
});

describe('extensionsOf', () => {
  it('bundles all extension fields for a fully-extended record', () => {
    const value = {
      ...bare(),
      dishKey: 'banana-bread',
      versionLabel: 'Frugal',
      primaryVersion: true,
      funFacts: [{ text: 'a' }],
    };
    expect(extensionsOf(value)).toEqual({
      dishKey: 'banana-bread',
      versionLabel: 'Frugal',
      primaryVersion: true,
      funFacts: [{ text: 'a' }],
    });
  });

  it('reads an old record as no-extensions (funFacts [], others undefined, not primary)', () => {
    expect(extensionsOf(bare())).toEqual({
      dishKey: undefined,
      versionLabel: undefined,
      primaryVersion: false,
      funFacts: [],
    });
  });
});
