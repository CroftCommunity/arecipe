// D15 Phase 6A — nutritionOf presenter accessor. Reads the open-world
// `nutrition` object defensively (like firstImageCredit): only finite numbers
// survive, and an absent/empty/garbage object yields null so the view can hide
// the section. The Wikibooks corpus populates only `calories`.
import { describe, expect, it } from 'vitest';
import { nutritionOf } from '../../../src/recipes/present.js';

describe('nutritionOf', () => {
  it('returns the numeric nutrition fields when present', () => {
    expect(nutritionOf({ nutrition: { calories: 250 } })).toEqual({ calories: 250 });
    expect(nutritionOf({ nutrition: { calories: 300, fatContent: 12, proteinContent: 8, carbohydrateContent: 40 } })).toEqual({
      calories: 300,
      fatContent: 12,
      proteinContent: 8,
      carbohydrateContent: 40,
    });
  });

  it('returns null when nutrition is absent, empty, or has no valid numbers', () => {
    expect(nutritionOf({})).toBeNull();
    expect(nutritionOf({ nutrition: {} })).toBeNull();
    expect(nutritionOf({ nutrition: { calories: 'lots' } })).toBeNull();
    expect(nutritionOf({ nutrition: null })).toBeNull();
    expect(nutritionOf({ nutrition: 'nope' })).toBeNull();
  });

  it('drops mistyped or non-finite fields, keeping the valid ones', () => {
    expect(nutritionOf({ nutrition: { calories: 200, fatContent: 'x', proteinContent: NaN } })).toEqual({ calories: 200 });
  });
});
