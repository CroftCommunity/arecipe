// Phase 4: mapping an ImportedRecipe into EditorFields (D3). Ingredients and
// instructions join to one-per-line; ISO-8601 durations become minutes; the
// source URL rides along as provenance. Empty buckets map to empty strings —
// the draft is left blank there, never fabricated.
import { describe, expect, it } from 'vitest';
import { mapImportedToFields } from '../../../src/import/to-fields.js';
import type { ImportedRecipe } from '../../../src/import/recipe-jsonld.js';

const base: ImportedRecipe = { ingredients: [], instructions: [] };

describe('mapImportedToFields', () => {
  it('maps every D3 field into EditorFields', () => {
    const recipe: ImportedRecipe = {
      name: 'Pancakes',
      text: 'Fluffy.',
      ingredients: ['2 cups flour', '1 cup milk'],
      instructions: ['Whisk.', 'Cook.'],
      recipeYield: '4 servings',
      prepTime: 'PT10M',
      totalTime: 'PT1H15M',
    };
    const f = mapImportedToFields(recipe, 'https://x/r');
    expect(f.name).toBe('Pancakes');
    expect(f.text).toBe('Fluffy.');
    expect(f.ingredients).toBe('2 cups flour\n1 cup milk');
    expect(f.instructions).toBe('Whisk.\nCook.');
    expect(f.recipeYield).toBe('4 servings');
    expect(f.prepMinutes).toBe(10);
    expect(f.totalMinutes).toBe(75);
    expect(f.sourceUrl).toBe('https://x/r');
  });

  it('leaves an empty bucket as an empty string (no fabrication)', () => {
    const f = mapImportedToFields({ ...base, name: 'Only Name' }, 'https://x/r');
    expect(f.ingredients).toBe('');
    expect(f.instructions).toBe('');
    expect(f.name).toBe('Only Name');
  });

  it('defaults absent name/text/yield/times to blank/zero', () => {
    const f = mapImportedToFields(base, 'https://x/r');
    expect(f.name).toBe('');
    expect(f.text).toBe('');
    expect(f.recipeYield).toBe('');
    expect(f.prepMinutes).toBe(0);
    expect(f.totalMinutes).toBe(0);
  });

  it('omits sourceUrl when the URL is blank (e.g. a paste without a link)', () => {
    const f = mapImportedToFields({ ...base, name: 'N' }, '');
    expect(f.sourceUrl).toBeUndefined();
  });
});
