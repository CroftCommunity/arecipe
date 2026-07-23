// @vitest-environment happy-dom
// EXP-IMPORT (share-accuracy hardening). A direct share carries VISIBLE TEXT,
// not the page's HTML — so the text heuristic, not the structured-data rungs, is
// what decides accuracy for the main use case. Real shared recipe text is messy:
// site chrome ("Jump to Recipe", "Print", star ratings), prose metadata
// ("Prep Time: 15 minutes", "Servings: 10"), ingredient sub-headings
// ("For the sauce:"), informal unlabeled steps, and trailing junk (Nutrition,
// Comments). These pin the hardened behavior. The original conservative contract
// (confidence gate, no fabrication from prose) is preserved by text-heuristic.spec.ts.
import { describe, expect, it } from 'vitest';
import { parseRecipeText } from '../../../src/import/recipe-text.js';

describe('parseRecipeText · shared-text hardening', () => {
  it('strips site chrome and trailing junk, keeps the real recipe', () => {
    const r = parseRecipeText(
      [
        'Best Banana Bread',
        'Jump to Recipe',
        'Print Recipe',
        'Save Recipe',
        '5 from 328 votes',
        '',
        'Prep Time: 15 minutes',
        'Cook Time: 1 hour',
        'Servings: 10 slices',
        '',
        'Ingredients',
        '3 ripe bananas',
        '1/3 cup melted butter',
        '1 cup sugar',
        '2 cups flour',
        '',
        'Instructions',
        'Preheat the oven to 350°F.',
        'Mash the bananas and mix in the butter.',
        'Stir in the sugar, then the flour.',
        'Bake for one hour.',
        '',
        'Nutrition',
        'Calories: 250kcal',
        'Did you make this recipe? Tag us!',
        'Comments',
        'Great recipe, thanks!',
      ].join('\n'),
    );
    expect(r.name).toBe('Best Banana Bread');
    expect(r.ingredients).toEqual(['3 ripe bananas', '1/3 cup melted butter', '1 cup sugar', '2 cups flour']);
    expect(r.instructions).toEqual([
      'Preheat the oven to 350°F.',
      'Mash the bananas and mix in the butter.',
      'Stir in the sugar, then the flour.',
      'Bake for one hour.',
    ]);
    expect(r.recipeYield).toBe('10 slices');
    expect(r.prepTime).toBe('PT15M');
    // No chrome or junk leaked into any field.
    const all = [r.name ?? '', ...r.ingredients, ...r.instructions].join(' | ');
    expect(all).not.toMatch(/jump to recipe|print|votes|nutrition|calories|comments|tag us/i);
  });

  it('keeps ingredient sub-headings as labels', () => {
    const r = parseRecipeText(
      [
        'Weeknight Lasagna',
        'Ingredients',
        'For the sauce:',
        '1 lb ground beef',
        '1 can crushed tomatoes',
        '2 cloves garlic',
        'For the cheese:',
        '2 cups ricotta',
        '1 egg',
        '1/2 cup parmesan',
        'Instructions',
        'Brown the beef, then add the tomatoes and garlic.',
        'Layer with the cheese and bake.',
      ].join('\n'),
    );
    expect(r.ingredients).toEqual([
      '— For the sauce',
      '1 lb ground beef',
      '1 can crushed tomatoes',
      '2 cloves garlic',
      '— For the cheese',
      '2 cups ricotta',
      '1 egg',
      '1/2 cup parmesan',
    ]);
    expect(r.instructions).toHaveLength(2);
  });

  it('parses informal shared text with unlabeled steps (no headings, lowercase)', () => {
    const r = parseRecipeText(
      [
        "hey here's that soup you wanted!!",
        'white bean & kale soup',
        '- 2 tbsp olive oil',
        '- 1 onion, diced',
        '- 3 cloves garlic',
        '- 2 cans white beans',
        '- 1 bunch kale',
        '- 6 cups stock',
        'heat the oil and soften the onion and garlic',
        'add the beans and stock and simmer 15 min',
        'stir in the kale and cook till wilted',
      ].join('\n'),
    );
    expect(r.ingredients).toEqual([
      '2 tbsp olive oil',
      '1 onion, diced',
      '3 cloves garlic',
      '2 cans white beans',
      '1 bunch kale',
      '6 cups stock',
    ]);
    expect(r.instructions).toEqual([
      'heat the oil and soften the onion and garlic',
      'add the beans and stock and simmer 15 min',
      'stir in the kale and cook till wilted',
    ]);
  });

  it('reads prep/total durations from prose into ISO-8601', () => {
    const r = parseRecipeText(
      [
        'Roast Chicken',
        'Prep Time 20 mins',
        'Total Time: 1 hour 30 minutes',
        'Serves 4',
        'Ingredients',
        '1 whole chicken',
        '2 tbsp butter',
        '1 lemon',
        'Instructions',
        'Season and roast until done.',
      ].join('\n'),
    );
    expect(r.prepTime).toBe('PT20M');
    expect(r.totalTime).toBe('PT1H30M');
    expect(r.recipeYield).toBe('4');
  });

  it('still refuses to fabricate from a chrome-only share with no ingredient block', () => {
    const r = parseRecipeText(
      ['Some Blog', 'Jump to Recipe', 'Print', 'Save', '5 from 10 votes', 'Comments', 'nice!'].join('\n'),
    );
    expect(r.ingredients).toEqual([]);
    expect(r.instructions).toEqual([]);
  });
});
