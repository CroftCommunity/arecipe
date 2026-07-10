// Recipe export (Browse "export" button): serialize the currently-shown
// recipes to CSV / TXT / JSON, optionally with full details (ingredients +
// instructions). Pure — the browse page maps its entries to ExportRecipe and
// hands the string to a download link. Behaviors:
//  - base fields always present; details are opt-in
//  - CSV quoting for values with commas/quotes/newlines
//  - JSON round-trips to structured objects
//  - the right MIME + extension per format
import { describe, expect, it } from 'vitest';
import {
  extensionFor,
  mimeFor,
  serializeRecipes,
  type ExportRecipe,
} from '../../../src/recipes/export.js';

const recipe = (over: Partial<ExportRecipe> = {}): ExportRecipe => ({
  name: 'Greek Salad',
  cuisine: 'greek',
  category: 'salad',
  link: 'https://arecipe.app/recipe.html?u=at://did:plc:x/exchange.recipe.recipe/1',
  ingredients: ['2 cucumbers', '1 block feta'],
  instructions: ['Chop everything.', 'Toss with oil.'],
  ...over,
});

describe('serializeRecipes — JSON', () => {
  it('emits base fields only when details are off, and parses back to objects', () => {
    const json = serializeRecipes([recipe()], { format: 'json', details: false });
    const parsed = JSON.parse(json) as Record<string, unknown>[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      name: 'Greek Salad',
      cuisine: 'greek',
      category: 'salad',
      link: 'https://arecipe.app/recipe.html?u=at://did:plc:x/exchange.recipe.recipe/1',
    });
    expect(parsed[0]).not.toHaveProperty('ingredients');
  });

  it('includes ingredients + instructions arrays when details are on', () => {
    const json = serializeRecipes([recipe()], { format: 'json', details: true });
    const parsed = JSON.parse(json) as Record<string, unknown>[];
    expect(parsed[0]?.['ingredients']).toEqual(['2 cucumbers', '1 block feta']);
    expect(parsed[0]?.['instructions']).toEqual(['Chop everything.', 'Toss with oil.']);
  });
});

describe('serializeRecipes — CSV', () => {
  it('writes a header row and one row per recipe (base fields)', () => {
    const csv = serializeRecipes([recipe()], { format: 'csv', details: false });
    const [header, row] = csv.split('\n');
    expect(header).toBe('name,cuisine,category,link');
    expect(row).toContain('Greek Salad');
  });

  it('adds ingredients/instructions columns when details are on', () => {
    const csv = serializeRecipes([recipe()], { format: 'csv', details: true });
    expect(csv.split('\n')[0]).toBe('name,cuisine,category,link,ingredients,instructions');
    expect(csv).toContain('2 cucumbers');
  });

  it('quotes and escapes values containing commas, quotes, or newlines', () => {
    const csv = serializeRecipes(
      [recipe({ name: 'Beans, "special"', cuisine: 'tex-mex' })],
      { format: 'csv', details: false },
    );
    // A comma and embedded quotes force quoting; inner quotes are doubled.
    expect(csv).toContain('"Beans, ""special"""');
  });
});

describe('serializeRecipes — TXT', () => {
  it('is human-readable with the name and base facts', () => {
    const txt = serializeRecipes([recipe()], { format: 'txt', details: false });
    expect(txt).toContain('Greek Salad');
    expect(txt).toContain('greek');
    expect(txt).not.toContain('Chop everything.'); // details off → no instructions
  });

  it('lists ingredients and instructions when details are on', () => {
    const txt = serializeRecipes([recipe()], { format: 'txt', details: true });
    expect(txt).toContain('2 cucumbers');
    expect(txt).toContain('Chop everything.');
  });
});

describe('mimeFor / extensionFor', () => {
  it('maps each format to a MIME type and file extension', () => {
    expect(mimeFor('json')).toBe('application/json');
    expect(mimeFor('csv')).toBe('text/csv');
    expect(mimeFor('txt')).toBe('text/plain');
    expect(extensionFor('json')).toBe('json');
    expect(extensionFor('csv')).toBe('csv');
    expect(extensionFor('txt')).toBe('txt');
  });
});
