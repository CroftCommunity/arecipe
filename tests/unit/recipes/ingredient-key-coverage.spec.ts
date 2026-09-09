// M1 exit metric (plans/2026-08-12-1 Phase 2): the shipped vocabulary resolves
// at least the floor share of the corpus's ingredient LINES (by line weight,
// over the census fixture — every distinct raw line with its count). Phase 0
// measured 46% for raw names and 62% after a head-phrase split at top-500,
// and proposed 75–80% for M1 with 90% held for the GATE; this pins the floor
// so a vocabulary or resolver regression is a red test, not a vibe.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveIngredient } from '../../../src/recipes/ingredient-key.js';
import { INGREDIENT_VOCABULARY, INGREDIENT_VOCABULARY_META } from '../../../src/recipes/ingredient-vocabulary.js';

const census = JSON.parse(
  readFileSync(new URL('../../fixtures/ingredients/census-lines.json', import.meta.url), 'utf8'),
) as { lines: number; rows: [string, number][] };

const M1_FLOOR = 0.75;

describe('ingredient vocabulary coverage (M1 metric)', () => {
  const measured = (() => {
    let matched = 0;
    for (const [raw, count] of census.rows) {
      if (resolveIngredient(raw, INGREDIENT_VOCABULARY).method !== 'unmatched') matched += count;
    }
    return matched / census.lines;
  })();

  it(`resolves at least ${M1_FLOOR * 100}% of corpus lines by weight`, () => {
    console.log(`[ingredient-vocab] coverage ${(measured * 100).toFixed(1)}% over ${census.lines} lines, ${INGREDIENT_VOCABULARY_META.keys} keys`);
    expect(measured).toBeGreaterThanOrEqual(M1_FLOOR);
  });

  it('ships a _meta.coverage that matches what the resolver measures (no stale vocabulary)', () => {
    expect(Math.abs(INGREDIENT_VOCABULARY_META.coverage - measured)).toBeLessThan(0.001);
  });

  it('never resolves a key by substring: a bread-flour line does not become flour', () => {
    const r = resolveIngredient('500 g bread flour', INGREDIENT_VOCABULARY);
    if (r.method !== 'unmatched') expect(r.key).not.toBe('flour');
  });
});
