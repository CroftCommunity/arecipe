// @vitest-environment happy-dom
// EXP-IMPORT-EXTRACTION · Arm 2 (constrained model extraction) — code + safety
// wiring, exercised with a MOCK model. The live model (Chrome's Prompt API /
// Gemini Nano) is desktop-Chrome-and-hardware-gated and cannot run in this
// environment, so the LIVE metrics (rejection rate, latency, availability) are
// deferred to a field run — see docs/EXP-IMPORT-EXTRACTION.md. What IS pinned
// here is the behavior that makes the arm safe to ship at all:
//   1. the verbatim gate rejects a whole extraction if ANY span is not in source;
//   2. deterministic output always wins — the model only fills EMPTY fields and
//      never overwrites a field the parser already found.
import { describe, expect, it } from 'vitest';
import {
  extractWithModel,
  mergeDeterministicFirst,
  RECIPE_RESPONSE_SCHEMA,
  type ModelSession,
} from '../../../src/import/model-extract.js';
import type { ImportedRecipe } from '../../../src/import/recipe-jsonld.js';

/** A mock session that returns a fixed string, ignoring the prompt. */
const fixedSession = (reply: string): ModelSession => ({
  prompt: async () => reply,
});

const SOURCE =
  'Skillet Cornbread\n1 cup cornmeal\n1 cup flour\n1 cup buttermilk\nHeat the skillet. Mix the batter and pour it in. Bake until golden.';

describe('RECIPE_RESPONSE_SCHEMA', () => {
  it('constrains output to the recipe field shape with string-array ingredients/instructions', () => {
    expect(RECIPE_RESPONSE_SCHEMA.type).toBe('object');
    expect(RECIPE_RESPONSE_SCHEMA.properties.ingredients.type).toBe('array');
    expect(RECIPE_RESPONSE_SCHEMA.properties.instructions.type).toBe('array');
    expect(RECIPE_RESPONSE_SCHEMA.properties.ingredients.items.type).toBe('string');
  });
});

describe('extractWithModel · verbatim gate', () => {
  it('accepts an extraction where every span appears verbatim in the source', async () => {
    const session = fixedSession(
      JSON.stringify({
        name: 'Skillet Cornbread',
        ingredients: ['1 cup cornmeal', '1 cup flour', '1 cup buttermilk'],
        instructions: ['Heat the skillet.', 'Bake until golden.'],
      }),
    );
    const r = await extractWithModel(SOURCE, session);
    expect(r.kind).toBe('extracted');
    if (r.kind === 'extracted') {
      expect(r.recipe.ingredients).toHaveLength(3);
      expect(r.recipe.instructions).toContain('Bake until golden.');
    }
  });

  it('REJECTS THE WHOLE extraction if any instruction was composed (not in source)', async () => {
    const session = fixedSession(
      JSON.stringify({
        ingredients: ['1 cup cornmeal'],
        // This step paraphrases — it is NOT a verbatim span of the source.
        instructions: ['Combine everything and bake in a preheated oven for best results.'],
      }),
    );
    const r = await extractWithModel(SOURCE, session);
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') {
      expect(r.violations).toContain('Combine everything and bake in a preheated oven for best results.');
    }
  });

  it('rejects wholesale even when only ONE of several spans is fabricated', async () => {
    const session = fixedSession(
      JSON.stringify({
        ingredients: ['1 cup cornmeal', '2 cups sugar' /* not in source */],
        instructions: ['Heat the skillet.'],
      }),
    );
    const r = await extractWithModel(SOURCE, session);
    expect(r.kind).toBe('rejected'); // the good lines are discarded too
  });

  it('classifies an all-empty extraction as empty (nothing selected), not extracted', async () => {
    const session = fixedSession(JSON.stringify({ ingredients: [], instructions: [] }));
    const r = await extractWithModel(SOURCE, session);
    expect(r.kind).toBe('empty');
  });

  it('classifies non-JSON / schema-violating model output as malformed (never throws)', async () => {
    const r = await extractWithModel(SOURCE, fixedSession('I could not find a recipe, sorry!'));
    expect(r.kind).toBe('malformed');
  });
});

describe('mergeDeterministicFirst · deterministic always wins', () => {
  const deterministic: ImportedRecipe = {
    name: 'Skillet Cornbread',
    ingredients: ['1 cup cornmeal', '1 cup flour', '1 cup buttermilk'],
    instructions: [], // the ONE gap the model may fill
  };
  const model: ImportedRecipe = {
    name: 'WRONG NAME FROM MODEL',
    ingredients: ['model ingredient that must be ignored'],
    instructions: ['Heat the skillet.', 'Bake until golden.'],
  };

  it('fills only the empty side and never overwrites a field the parser found', () => {
    const merged = mergeDeterministicFirst(deterministic, model);
    expect(merged.name).toBe('Skillet Cornbread'); // parser name kept
    expect(merged.ingredients).toEqual(deterministic.ingredients); // parser ingredients kept
    expect(merged.instructions).toEqual(['Heat the skillet.', 'Bake until golden.']); // gap filled
  });

  it('leaves a fully-populated deterministic recipe untouched (model never runs its output in)', () => {
    const full: ImportedRecipe = {
      name: 'A', ingredients: ['x'], instructions: ['y'], recipeYield: '4',
    };
    const merged = mergeDeterministicFirst(full, model);
    expect(merged).toEqual(full);
  });
});
