// EXP-IMPORT-EXTRACTION · Arm 2 safety core. This validator is the single most
// important piece of the model arm: it enforces the provenance invariant that
// makes a model assist safe to ship at all —
//
//   Every extracted ingredient/instruction string MUST appear verbatim in the
//   source text. An extraction containing ANY string that does not is rejected
//   WHOLESALE, never partially accepted.
//
// The model selects spans; it never writes prose. If this function is wrong,
// every Arm 2 number is meaningless — so it is written test-first, RED before
// GREEN, and covers exact match, whitespace-normalized match, an absent string,
// a string that is a substring of a *different* field, empty extraction, and
// empty source (the six cases the experiment mandates), plus the wholesale
// rejection contract.
import { describe, expect, it } from 'vitest';
import { appearsVerbatim, validateVerbatim } from '../../../src/import/verbatim.js';

describe('appearsVerbatim (single span)', () => {
  const source =
    'Ingredients: 2 cups flour, 1 tsp salt.\nMethod: Whisk the flour and salt, then bake for 25 minutes.';

  it('accepts an exact substring of the source', () => {
    expect(appearsVerbatim('2 cups flour', source)).toBe(true);
    expect(appearsVerbatim('Whisk the flour and salt, then bake for 25 minutes.', source)).toBe(true);
  });

  it('accepts a match that differs only in whitespace (collapsed runs, newlines, padding)', () => {
    expect(appearsVerbatim('2   cups\tflour', source)).toBe(true);
    expect(appearsVerbatim('  Whisk the flour and salt,\nthen bake for 25 minutes.  ', source)).toBe(true);
  });

  it('rejects a string that does not appear in the source at all', () => {
    // A composed / paraphrased line — the failure mode the invariant exists to catch.
    expect(appearsVerbatim('Combine the dry ingredients thoroughly', source)).toBe(false);
    expect(appearsVerbatim('3 cups flour', source)).toBe(false);
  });

  it('accepts a span even when it belongs, in the source, to a different field', () => {
    // "flour" is introduced under Ingredients but also appears inside the Method
    // sentence. A model may legitimately SELECT "the flour and salt" — it is a
    // real span of the source, so provenance holds regardless of which field it
    // was surfaced under. Verbatim presence is checked against the WHOLE source.
    expect(appearsVerbatim('the flour and salt', source)).toBe(true);
  });

  it('rejects an empty span against a non-empty source (not a real selection)', () => {
    expect(appearsVerbatim('', source)).toBe(false);
    expect(appearsVerbatim('   \n\t ', source)).toBe(false);
  });

  it('rejects any non-empty span against an empty source', () => {
    expect(appearsVerbatim('anything', '')).toBe(false);
  });
});

describe('validateVerbatim (whole extraction, wholesale rejection)', () => {
  const source =
    'Classic Pancakes\nIngredients\n2 cups flour\n1 1/2 cups milk\n2 eggs\nMethod\n1. Whisk the dry ingredients.\n2. Stir in the milk and eggs until just combined.\n3. Cook on a hot griddle until bubbles form.';

  it('passes when every extracted string appears verbatim', () => {
    const r = validateVerbatim(
      ['2 cups flour', '1 1/2 cups milk', '2 eggs'],
      ['Whisk the dry ingredients.', 'Stir in the milk and eggs until just combined.'],
      source,
    );
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('rejects the WHOLE extraction if even one string is not verbatim, and reports every offender', () => {
    const r = validateVerbatim(
      ['2 cups flour', '3 tablespoons sugar' /* not in source */],
      ['Whisk the dry ingredients.', 'Beat the eggs separately' /* composed */],
      source,
    );
    expect(r.ok).toBe(false);
    // Wholesale: the caller must discard the entire draft, not keep the good lines.
    expect(r.violations).toEqual(['3 tablespoons sugar', 'Beat the eggs separately']);
  });

  it('tolerates whitespace differences across the whole extraction', () => {
    const r = validateVerbatim(
      ['2  cups   flour'],
      ['Cook on a hot griddle\nuntil bubbles form.'],
      source,
    );
    expect(r.ok).toBe(true);
  });

  it('is vacuously valid for an empty extraction (nothing to violate)', () => {
    expect(validateVerbatim([], [], source)).toEqual({ ok: true, violations: [] });
  });

  it('rejects a non-empty extraction against an empty source', () => {
    const r = validateVerbatim(['2 cups flour'], [], '');
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(['2 cups flour']);
  });

  it('treats an empty-string field entry as a violation (a model must not emit blank spans)', () => {
    const r = validateVerbatim(['2 cups flour', ''], [], source);
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(['']);
  });
});
