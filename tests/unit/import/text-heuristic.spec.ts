// @vitest-environment happy-dom
// Phase 2: the paste-of-visible-text heuristic (D4). The second rung of the
// parse ladder — used when a page has no JSON-LD Recipe, or when the cook pastes
// the recipe text directly. Ingredients = the longest run of ≥3 consecutive
// quantity/bullet-led lines; instructions = numbered lines, or the paragraphs
// after a heading token. An empty bucket imports PARTIALLY (the missing side
// stays blank and gets flagged) — the heuristic never fabricates content.
// (happy-dom gives DOMParser for the shared sanitizer.)
import { describe, expect, it } from 'vitest';
import { parseRecipeText } from '../../../src/import/recipe-text.js';

describe('parseRecipeText', () => {
  it('reads quantity-led ingredients and numbered instructions', () => {
    const r = parseRecipeText(
      [
        "Grandma's Cornbread",
        '',
        '1 cup cornmeal',
        '1 cup flour',
        '1 tablespoon sugar',
        '1 cup buttermilk',
        '',
        '1. Mix the dry ingredients.',
        '2. Stir in the buttermilk.',
        '3. Bake at 400°F for 20 minutes.',
      ].join('\n'),
    );
    expect(r.name).toBe("Grandma's Cornbread");
    expect(r.ingredients).toEqual([
      '1 cup cornmeal',
      '1 cup flour',
      '1 tablespoon sugar',
      '1 cup buttermilk',
    ]);
    expect(r.instructions).toEqual([
      'Mix the dry ingredients.',
      'Stir in the buttermilk.',
      'Bake at 400°F for 20 minutes.',
    ]);
  });

  it('strips bullets and reads instructions after a heading token', () => {
    const r = parseRecipeText(
      [
        'Simple Salad',
        '',
        '- 2 cups greens',
        '- 1 tomato',
        '- 1 tablespoon olive oil',
        '',
        'Method',
        'Toss the greens with the tomato.',
        'Drizzle with olive oil and serve.',
      ].join('\n'),
    );
    expect(r.name).toBe('Simple Salad');
    expect(r.ingredients).toEqual(['2 cups greens', '1 tomato', '1 tablespoon olive oil']);
    expect(r.instructions).toEqual([
      'Toss the greens with the tomato.',
      'Drizzle with olive oil and serve.',
    ]);
  });

  it('detects unicode-fraction quantities and an "Instructions" heading', () => {
    const r = parseRecipeText(
      [
        'Shortbread',
        '',
        '½ cup sugar',
        '¼ cup butter',
        '1 cup flour',
        '',
        'Instructions',
        'Cream the butter and sugar.',
        'Work in the flour and press into a pan.',
        'Bake until golden.',
      ].join('\n'),
    );
    expect(r.ingredients).toEqual(['½ cup sugar', '¼ cup butter', '1 cup flour']);
    expect(r.instructions).toHaveLength(3);
  });

  it('imports PARTIALLY when only ingredients are present (instructions blank)', () => {
    const r = parseRecipeText(
      ['Quick Snack', '', '1 apple', '2 tablespoons peanut butter', '1 teaspoon honey'].join('\n'),
    );
    expect(r.ingredients).toHaveLength(3);
    expect(r.instructions).toEqual([]);
  });

  it('finds neither in prose (no fabrication) — both buckets empty', () => {
    const r = parseRecipeText(
      [
        'This is just a blog post about my trip to Italy where I ate a lot of pasta.',
        'It was a wonderful vacation and I cannot wait to go back next year.',
      ].join('\n'),
    );
    expect(r.ingredients).toEqual([]);
    expect(r.instructions).toEqual([]);
  });

  it('needs at least three consecutive ingredient-like lines (confidence gate)', () => {
    const r = parseRecipeText(['Two Things', '', '1 egg', '1 cup milk'].join('\n'));
    expect(r.ingredients).toEqual([]);
  });
});
