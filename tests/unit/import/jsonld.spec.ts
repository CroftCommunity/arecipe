// @vitest-environment happy-dom
// Phase 1: JSON-LD (schema.org/Recipe) extractor. Recipe sites overwhelmingly
// embed a Recipe as JSON-LD because Google's rich results require it, and
// arecipe's lexicon already uses schema.org field names — so the mapping is
// near-identity. The extractor is pure: it takes an INERT Document (parsed via
// DOMParser, never assigned into the live DOM) and returns an ImportedRecipe or
// null. The fixture corpus covers every shape seen in the wild.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractRecipeFromJsonLd } from '../../../src/import/recipe-jsonld.js';

const fixture = (name: string): Document => {
  // cwd-relative (repo root) per the happy-dom fixture convention — in the DOM
  // environment `import.meta.url` resolves against the document location, not fs.
  const html = readFileSync(`tests/fixtures/import/${name}`, 'utf8');
  // The inert parse the extractor consumes in production comes from the same
  // DOMParser — here we feed it a fixture document directly.
  return new DOMParser().parseFromString(html, 'text/html');
};

describe('extractRecipeFromJsonLd', () => {
  it('parses a plain Recipe object with all facets', () => {
    const r = extractRecipeFromJsonLd(fixture('plain-recipe.html'));
    expect(r).not.toBeNull();
    expect(r?.name).toBe('Classic Pancakes');
    expect(r?.text).toBe('Fluffy weekend pancakes.');
    expect(r?.recipeYield).toBe('4 servings');
    expect(r?.prepTime).toBe('PT10M');
    expect(r?.totalTime).toBe('PT25M');
    expect(r?.ingredients).toEqual([
      '2 cups flour',
      '2 tablespoons sugar',
      '1 tablespoon baking powder',
      '1 1/2 cups milk',
    ]);
    expect(r?.instructions).toEqual([
      'Whisk the dry ingredients.',
      'Stir in the milk until just combined.',
      'Cook on a hot griddle until bubbles form.',
    ]);
  });

  it('finds the Recipe inside an @graph among other nodes', () => {
    const r = extractRecipeFromJsonLd(fixture('graph-recipe.html'));
    expect(r?.name).toBe('Tomato Soup');
    expect(r?.ingredients).toHaveLength(3);
    expect(r?.instructions).toEqual(['Sweat the onion.', 'Add tomatoes and stock.', 'Simmer and blend.']);
  });

  it('tolerates @type as an array', () => {
    const r = extractRecipeFromJsonLd(fixture('type-array.html'));
    expect(r?.name).toBe('Guacamole');
    expect(r?.instructions).toEqual(['Mash the avocados.', 'Squeeze in the lime and season.']);
  });

  it('splits recipeInstructions given as a single numbered string', () => {
    const r = extractRecipeFromJsonLd(fixture('instructions-string.html'));
    expect(r?.instructions).toEqual([
      'Boil the water.',
      'Steep the tea bags for five minutes.',
      'Chill and serve over ice.',
    ]);
  });

  it('reads HowToStep[] via each step text', () => {
    const r = extractRecipeFromJsonLd(fixture('howto-steps.html'));
    expect(r?.instructions).toEqual([
      'Beat the eggs with a pinch of salt.',
      'Melt butter over low heat.',
      'Add eggs and stir gently until just set.',
    ]);
  });

  it('flattens HowToSection[] with section names as their own prefixed lines', () => {
    const r = extractRecipeFromJsonLd(fixture('howto-sections.html'));
    expect(r?.instructions).toEqual([
      '— Cake',
      'Cream butter and sugar.',
      'Fold in the flour and bake.',
      '— Frosting',
      'Whip the frosting until fluffy.',
      'Spread between the cooled layers.',
    ]);
  });

  it('reads the legacy `ingredients` key when recipeIngredient is absent', () => {
    const r = extractRecipeFromJsonLd(fixture('legacy-ingredients.html'));
    expect(r?.ingredients).toEqual(['1 cup lemon juice', '1 cup sugar', '4 cups water']);
    expect(r?.instructions).toEqual(['Stir everything together and chill.']);
  });

  it('decodes HTML entities and strips embedded tags in every string', () => {
    const r = extractRecipeFromJsonLd(fixture('entities-and-tags.html'));
    expect(r?.name).toBe('Mac & Cheese');
    expect(r?.text).toBe('Creamy & sharp — a crowd favorite.');
    expect(r?.ingredients).toEqual([
      '8 oz macaroni',
      '2 cups sharp cheddar & gruyère',
      '2 tablespoons butter',
    ]);
    // <p>…</p><p>…</p> becomes two steps; no tags survive.
    expect(r?.instructions).toEqual(['Boil the pasta.', 'Make a cheese sauce & combine.']);
    for (const line of [...(r?.ingredients ?? []), ...(r?.instructions ?? [])]) {
      expect(line).not.toMatch(/[<>]/);
    }
  });

  it('picks the one Recipe among multiple ld+json scripts', () => {
    const r = extractRecipeFromJsonLd(fixture('multiple-scripts.html'));
    expect(r?.name).toBe('Banana Bread');
    expect(r?.ingredients).toHaveLength(3);
    expect(r?.instructions).toHaveLength(3);
  });

  it('returns null when no Recipe node exists', () => {
    expect(extractRecipeFromJsonLd(fixture('no-recipe.html'))).toBeNull();
  });

  it('returns null when there is no ld+json at all', () => {
    const doc = new DOMParser().parseFromString('<!doctype html><title>x</title><p>hi</p>', 'text/html');
    expect(extractRecipeFromJsonLd(doc)).toBeNull();
  });

  it('skips malformed ld+json without throwing and finds the valid Recipe', () => {
    const html =
      '<!doctype html><script type="application/ld+json">{ not json ,,, }</script>' +
      '<script type="application/ld+json">{"@type":"Recipe","name":"OK","recipeIngredient":["a"],"recipeInstructions":"Do it."}</script>';
    const r = extractRecipeFromJsonLd(new DOMParser().parseFromString(html, 'text/html'));
    expect(r?.name).toBe('OK');
  });

  it('clamps every string to the recipe lexicon maxima', () => {
    const longName = 'N'.repeat(300);
    const longIngredient = 'i'.repeat(600);
    const longStep = 's'.repeat(1200);
    const html =
      '<!doctype html><script type="application/ld+json">' +
      JSON.stringify({
        '@type': 'Recipe',
        name: longName,
        recipeIngredient: [longIngredient],
        recipeInstructions: [longStep],
      }) +
      '</script>';
    const r = extractRecipeFromJsonLd(new DOMParser().parseFromString(html, 'text/html'));
    expect(r?.name).toHaveLength(255);
    expect(r?.ingredients[0]).toHaveLength(500);
    expect(r?.instructions[0]).toHaveLength(1000);
  });

  it('normalizes a numeric or array recipeYield to a string', () => {
    const html =
      '<!doctype html><script type="application/ld+json">' +
      JSON.stringify({
        '@type': 'Recipe',
        name: 'Y',
        recipeYield: [8, 'servings'],
        recipeIngredient: ['a'],
        recipeInstructions: 'Do.',
      }) +
      '</script>';
    const r = extractRecipeFromJsonLd(new DOMParser().parseFromString(html, 'text/html'));
    expect(typeof r?.recipeYield).toBe('string');
    expect(r?.recipeYield).toBe('8');
  });
});
