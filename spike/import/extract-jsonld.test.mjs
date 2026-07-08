// TDD for the schema.org/Recipe JSON-LD extractor (ops tooling, spike/).
// Run: node --test spike/import/extract-jsonld.test.mjs
// The parser must survive the real-world shape zoo: a Recipe nested in
// @graph, instructions as plain strings / HowToStep objects / HowToSection
// groupings, and recipeYield as string, number, or array.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findRecipeNode,
  stepTexts,
  firstYield,
  extractRecipeFromHtml,
} from './extract-jsonld.mjs';

const wrap = (obj) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head></html>`;

test('findRecipeNode locates a Recipe inside @graph', () => {
  const node = findRecipeNode({
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'WebPage' }, { '@type': 'Recipe', name: 'X' }],
  });
  assert.equal(node?.name, 'X');
});

test('findRecipeNode matches when @type is an array', () => {
  const node = findRecipeNode({ '@type': ['Recipe', 'NewsArticle'], name: 'Y' });
  assert.equal(node?.name, 'Y');
});

test('stepTexts handles plain strings, HowToStep, and HowToSection', () => {
  assert.deepEqual(stepTexts(['Chop.', 'Cook.']), ['Chop.', 'Cook.']);
  assert.deepEqual(
    stepTexts([
      { '@type': 'HowToStep', text: 'Chop onions.' },
      { '@type': 'HowToStep', text: 'Fry them.' },
    ]),
    ['Chop onions.', 'Fry them.'],
  );
  assert.deepEqual(
    stepTexts([
      {
        '@type': 'HowToSection',
        name: 'Sauce',
        itemListElement: [
          { '@type': 'HowToStep', text: 'Simmer tomatoes.' },
          { '@type': 'HowToStep', text: 'Season.' },
        ],
      },
    ]),
    ['Simmer tomatoes.', 'Season.'],
  );
});

test('stepTexts trims whitespace and drops empty steps', () => {
  assert.deepEqual(stepTexts([{ text: '  Mix well.  ' }, { text: '' }, '  ']), ['Mix well.']);
});

test('firstYield normalizes string, number, and array', () => {
  assert.equal(firstYield('4 servings'), '4 servings');
  assert.equal(firstYield(6), '6');
  assert.equal(firstYield(['8', '8 servings']), '8');
  assert.equal(firstYield(undefined), '');
});

test('extractRecipeFromHtml pulls the full fact set', () => {
  const html = wrap({
    '@graph': [
      {
        '@type': 'Recipe',
        name: 'Guacamole',
        recipeIngredient: ['3 avocados', '1 lime, juiced', 'Salt'],
        recipeInstructions: [
          { '@type': 'HowToStep', text: 'Mash avocados.' },
          { '@type': 'HowToStep', text: 'Stir in lime and salt.' },
        ],
        prepTime: 'PT10M',
        totalTime: 'PT10M',
        recipeYield: ['6', '6 servings'],
      },
    ],
  });
  const r = extractRecipeFromHtml(html);
  assert.equal(r.name, 'Guacamole');
  assert.deepEqual(r.ingredients, ['3 avocados', '1 lime, juiced', 'Salt']);
  assert.deepEqual(r.instructions, ['Mash avocados.', 'Stir in lime and salt.']);
  assert.equal(r.prepTime, 'PT10M');
  assert.equal(r.totalTime, 'PT10M');
  assert.equal(r.recipeYield, '6');
});

test('extractRecipeFromHtml returns null when no Recipe is present', () => {
  assert.equal(extractRecipeFromHtml(wrap({ '@type': 'WebPage' })), null);
});
