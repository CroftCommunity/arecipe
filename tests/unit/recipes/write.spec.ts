// Phase 6: building a valid exchange.recipe.recipe from editor fields.
// Behaviors:
// - a complete draft builds a record with $type, trimmed fields, and
//   createdAt/updatedAt timestamps
// - minutes convert to ISO-8601 durations (75 → PT1H15M); zero/absent omit
// - empty lines in ingredients/instructions are dropped
// - missing required fields fail loud, naming the field (lexicon floor:
//   name, text, ingredients, instructions)
import { describe, expect, it } from 'vitest';
import { buildRecipeRecord, minutesToIso } from '../../../src/recipes/write.js';

const fields = {
  name: '  Greek Salad  ',
  text: 'A bright summer side.',
  ingredients: '1 cucumber\n\n2 pints tomatoes\n',
  instructions: 'Chop everything.\nToss with dressing.\n\n',
  prepMinutes: 15,
  totalMinutes: 75,
  recipeYield: '8',
};

describe('minutesToIso', () => {
  it('converts minutes to ISO durations', () => {
    expect(minutesToIso(75)).toBe('PT1H15M');
    expect(minutesToIso(20)).toBe('PT20M');
    expect(minutesToIso(120)).toBe('PT2H');
  });

  it('treats zero and undefined as not set', () => {
    expect(minutesToIso(0)).toBeNull();
    expect(minutesToIso(undefined)).toBeNull();
  });
});

describe('buildRecipeRecord', () => {
  it('builds a typed record with trimmed fields and timestamps', () => {
    const record = buildRecipeRecord(fields);
    expect(record.$type).toBe('exchange.recipe.recipe');
    expect(record.name).toBe('Greek Salad');
    expect(record.ingredients).toEqual(['1 cucumber', '2 pints tomatoes']);
    expect(record.instructions).toEqual(['Chop everything.', 'Toss with dressing.']);
    expect(record.prepTime).toBe('PT15M');
    expect(record.totalTime).toBe('PT1H15M');
    expect(record.recipeYield).toBe('8');
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.updatedAt).toBe(record.createdAt);
  });

  it('omits unset optional fields entirely', () => {
    const record = buildRecipeRecord({ ...fields, prepMinutes: 0, recipeYield: '' });
    expect('prepTime' in record).toBe(false);
    expect('recipeYield' in record).toBe(false);
  });

  it.each([
    ['name', { ...fields, name: '  ' }],
    ['text', { ...fields, text: '' }],
    ['ingredients', { ...fields, ingredients: '\n\n' }],
    ['instructions', { ...fields, instructions: '' }],
  ])('fails loud when %s is missing', (field, bad) => {
    expect(() => buildRecipeRecord(bad)).toThrow(new RegExp(field));
  });
});
