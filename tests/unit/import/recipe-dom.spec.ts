// @vitest-environment happy-dom
// EXP-IMPORT-EXTRACTION · Arm 1 (deterministic hardening). The JSON-LD rung
// already covers the sites Google's rich-results program pushed onto JSON-LD.
// This adds the three structured formats a page-source paste still hits when
// there is NO usable JSON-LD: schema.org MICRODATA (itemscope/itemprop), RDFa
// (vocab/typeof/property), and the h-recipe MICROFORMAT (class names). All three
// operate on the same INERT Document the JSON-LD rung consumes, and reuse the
// same sanitize (decode/tag-strip/clamp) posture. Pure; fixtures drive it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extractRecipeFromMicrodata,
  extractRecipeFromRdfa,
  extractRecipeFromMicroformats,
  extractRecipeFromDom,
} from '../../../src/import/recipe-dom.js';

const fixture = (name: string): Document => {
  const html = readFileSync(`tests/fixtures/import/${name}`, 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
};

describe('extractRecipeFromMicrodata', () => {
  it('extracts name, ingredients and instructions from itemprop microdata', () => {
    const r = extractRecipeFromMicrodata(fixture('microdata-recipe.html'));
    expect(r?.name).toBe('Skillet Cornbread');
    expect(r?.ingredients).toEqual(['1 cup cornmeal', '1 cup flour', '1 cup buttermilk']);
    expect(r?.instructions).toEqual([
      'Heat the skillet in the oven.',
      'Mix the batter and pour it in.',
      'Bake until golden.',
    ]);
  });

  it('reads durations from a <time> content attribute and yield text', () => {
    const r = extractRecipeFromMicrodata(fixture('microdata-recipe.html'));
    expect(r?.prepTime).toBe('PT10M');
    expect(r?.totalTime).toBe('PT30M');
    expect(r?.recipeYield).toBe('8 servings');
  });

  it('does NOT pull itemprops out of a NESTED scope (e.g. an author/review block)', () => {
    // The nested Person/Review has its own name/ingredient-looking text; scoping
    // to the Recipe itemscope must exclude it.
    const r = extractRecipeFromMicrodata(fixture('microdata-nested-scope.html'));
    expect(r?.name).toBe('Lemon Bars');
    expect(r?.ingredients).not.toContain('Jane the Reviewer');
    expect(r?.ingredients).toEqual(['2 lemons', '1 cup sugar']);
  });

  it('returns null when there is no Recipe itemscope', () => {
    const doc = new DOMParser().parseFromString(
      '<!doctype html><div itemscope itemtype="https://schema.org/Article"><h1 itemprop="name">Not a recipe</h1></div>',
      'text/html',
    );
    expect(extractRecipeFromMicrodata(doc)).toBeNull();
  });
});

describe('extractRecipeFromRdfa', () => {
  it('extracts a recipe declared with vocab + typeof + property attributes', () => {
    const r = extractRecipeFromRdfa(fixture('rdfa-recipe.html'));
    expect(r?.name).toBe('Herb Focaccia');
    expect(r?.ingredients).toEqual(['500 g bread flour', '2 tsp salt', '350 ml water']);
    expect(r?.instructions).toEqual(['Mix and rest the dough.', 'Dimple, oil, and bake.']);
  });

  it('matches a prefixed property name (schema:recipeIngredient)', () => {
    const r = extractRecipeFromRdfa(fixture('rdfa-recipe.html'));
    // The prefixed-form ingredient must be picked up too.
    expect(r?.ingredients).toContain('2 tsp salt');
  });
});

describe('extractRecipeFromMicroformats (h-recipe)', () => {
  it('extracts h-recipe v2 class-based fields, splitting e-instructions into steps', () => {
    const r = extractRecipeFromMicroformats(fixture('hrecipe-recipe.html'));
    expect(r?.name).toBe('Iced Mint Tea');
    expect(r?.ingredients).toEqual(['4 tea bags', '1 handful mint', '1 liter water']);
    expect(r?.instructions).toEqual([
      'Boil the water and steep the tea.',
      'Add the mint and chill.',
    ]);
  });

  it('tolerates the legacy hrecipe (v1) class names', () => {
    const r = extractRecipeFromMicroformats(fixture('hrecipe-v1.html'));
    expect(r?.name).toBe('Quick Salsa');
    expect(r?.ingredients).toEqual(['3 tomatoes', '1 onion', '1 lime']);
  });
});

describe('extractRecipeFromDom (tries all three, JSON-LD-independent)', () => {
  it('prefers microdata, then rdfa, then microformats', () => {
    expect(extractRecipeFromDom(fixture('microdata-recipe.html'))?.name).toBe('Skillet Cornbread');
    expect(extractRecipeFromDom(fixture('rdfa-recipe.html'))?.name).toBe('Herb Focaccia');
    expect(extractRecipeFromDom(fixture('hrecipe-recipe.html'))?.name).toBe('Iced Mint Tea');
  });

  it('returns null on a page with none of the three formats', () => {
    const doc = new DOMParser().parseFromString(
      '<!doctype html><h1>Just prose</h1><p>No structured recipe here.</p>',
      'text/html',
    );
    expect(extractRecipeFromDom(doc)).toBeNull();
  });

  it('decodes entities and strips stray tags like the JSON-LD rung', () => {
    const doc = new DOMParser().parseFromString(
      '<!doctype html><div itemscope itemtype="http://schema.org/Recipe">' +
        '<h1 itemprop="name">Mac &amp; Cheese</h1>' +
        '<li itemprop="recipeIngredient">2 cups <b>sharp</b> cheddar &amp; gruy&egrave;re</li>' +
        '<li itemprop="recipeIngredient">8 oz macaroni</li>' +
        '<li itemprop="recipeIngredient">2 tbsp butter</li>' +
        '<li itemprop="recipeInstructions">Boil &amp; combine.</li></div>',
      'text/html',
    );
    const r = extractRecipeFromMicrodata(doc);
    expect(r?.name).toBe('Mac & Cheese');
    expect(r?.ingredients[0]).toBe('2 cups sharp cheddar & gruyère');
    for (const line of r?.ingredients ?? []) expect(line).not.toMatch(/[<>]/);
  });
});
