// EXP-IMPORT-EXTRACTION · the measurement instrument. Turns an extracted draft
// vs. a hand-keyed gold recipe into the numbers the experiment decides on:
//   - per field: one of exact | partial | missing | wrong (§8), plus precision
//     and recall for the two list fields (§5);
//   - per source: a USABLE-DRAFT verdict — "a person accepts the draft with no
//     edits or only trivial ones" (§5) — under an explicit trivial-edit budget;
//   - aggregate: the usable-draft RATE, the number that decides anything.
// Written test-first so the scoring rules are pinned before any source is run
// through them — an aggregator that flatters the parser would invalidate the
// whole finding.
import { describe, expect, it } from 'vitest';
import {
  scoreScalar,
  scoreList,
  scoreSource,
  isUsable,
  aggregate,
  type SourceScore,
} from '../../../src/import/score.js';

describe('scoreScalar', () => {
  it('exact on normalized equality (case/space/trailing punctuation ignored)', () => {
    expect(scoreScalar('4 servings', '4 Servings.')).toBe('exact');
    expect(scoreScalar('Classic Pancakes', 'classic   pancakes')).toBe('exact');
  });
  it('partial when the values overlap by containment but are not equal', () => {
    expect(scoreScalar('Grandma’s Banana Bread', 'Banana Bread')).toBe('partial');
  });
  it('missing when expected is present but nothing was extracted', () => {
    expect(scoreScalar('4 servings', '')).toBe('missing');
  });
  it('wrong when a present extraction shares nothing with the expected value', () => {
    expect(scoreScalar('4 servings', '350 degrees')).toBe('wrong');
  });
  it('exact (true negative) when the field is absent on both sides', () => {
    expect(scoreScalar('', '')).toBe('exact');
  });
  it('wrong (fabrication) when nothing was expected but something was produced', () => {
    expect(scoreScalar('', '6 servings')).toBe('wrong');
  });
});

describe('scoreList (precision / recall + field verdict)', () => {
  it('exact when every expected line is captured and no extra line is produced', () => {
    const r = scoreList(['2 cups flour', '1 tsp salt'], ['2 cups flour', '1 tsp salt']);
    expect(r.score).toBe('exact');
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(1);
  });
  it('partial when some expected lines are captured (containment counts as a match)', () => {
    const r = scoreList(
      ['2 cups flour', 'fine sea salt', '2 eggs'],
      ['2 cups flour', 'sea salt'], // "sea salt" ⊆ "fine sea salt" is a containment match; eggs missing
    );
    expect(r.score).toBe('partial');
    expect(r.recall).toBeCloseTo(2 / 3);
    expect(r.precision).toBe(1);
  });
  it('wrong when lines were produced but none match any expected line', () => {
    const r = scoreList(['2 cups flour'], ['preheat oven to 350']);
    expect(r.score).toBe('wrong');
    expect(r.recall).toBe(0);
    expect(r.precision).toBe(0);
  });
  it('missing when nothing was extracted for a non-empty expected list', () => {
    const r = scoreList(['2 cups flour'], []);
    expect(r.score).toBe('missing');
    expect(r.recall).toBe(0);
  });
  it('penalises precision when extra (unexpected) lines are produced', () => {
    const r = scoreList(['2 cups flour'], ['2 cups flour', 'a sprinkle of magic']);
    expect(r.precision).toBe(0.5);
    expect(r.recall).toBe(1);
    expect(r.score).toBe('partial'); // recovered everything but injected a wrong line
  });
});

// A gold/extracted recipe as the scorer consumes it.
const gold = {
  name: 'Classic Pancakes',
  ingredients: ['2 cups flour', '1 1/2 cups milk', '2 eggs'],
  instructions: ['Whisk the dry ingredients.', 'Stir in milk and eggs.', 'Cook on a griddle.'],
  recipeYield: '4 servings',
  prepTime: 'PT10M',
  totalTime: 'PT25M',
  image: 'https://x/y.jpg',
  sourceUrl: 'https://x/pancakes',
};

describe('scoreSource + isUsable (the trivial-edit rule)', () => {
  it('a perfect extraction is usable with zero edits', () => {
    const s = scoreSource(gold, gold);
    expect(s.fields.ingredients.score).toBe('exact');
    expect(s.fields.instructions.score).toBe('exact');
    expect(isUsable(s)).toBe(true);
    expect(s.trivialEdits).toBe(0);
  });

  it('both core sides present-but-partial plus a title tweak stays within the trivial budget', () => {
    const got = {
      ...gold,
      name: 'Pancakes', // partial (containment) — one trivial edit
      ingredients: ['2 cups flour', '1 1/2 cups milk'], // dropped eggs → partial
      recipeYield: '', // minor field missing → one trivial edit
    };
    const s = scoreSource(gold, got);
    expect(s.fields.ingredients.score).toBe('partial');
    expect(isUsable(s)).toBe(true);
  });

  it('a MISSING core side is never trivially fixable → not usable', () => {
    const got = { ...gold, ingredients: [] };
    const s = scoreSource(gold, got);
    expect(s.fields.ingredients.score).toBe('missing');
    expect(isUsable(s)).toBe(false);
  });

  it('a WRONG core side (lines produced, none correct) → not usable', () => {
    const got = { ...gold, instructions: ['lorem ipsum', 'dolor sit amet'] };
    const s = scoreSource(gold, got);
    expect(s.fields.instructions.score).toBe('wrong');
    expect(isUsable(s)).toBe(false);
  });

  it('too many minor touch-ups exhaust the budget → not usable', () => {
    const got = {
      name: '',
      ingredients: gold.ingredients,
      instructions: gold.instructions,
      recipeYield: '',
      prepTime: '',
      totalTime: '',
      image: '',
      sourceUrl: '',
    };
    const s = scoreSource(gold, got);
    // All 6 minor fields (name, yield, prep, total, image, source) need a fix; default budget is 3.
    expect(isUsable(s, 3)).toBe(false);
    expect(isUsable(s, 6)).toBe(true); // a looser budget would accept it
  });
});

describe('aggregate (the headline usable-draft rate)', () => {
  it('reports the fraction of usable sources and micro-averaged list precision/recall', () => {
    const scores: SourceScore[] = [
      scoreSource(gold, gold), // usable
      scoreSource(gold, { ...gold, ingredients: [] }), // not usable (core missing)
      scoreSource(gold, { ...gold, name: 'Pancakes' }), // usable (one trivial edit)
      scoreSource(gold, { ...gold, instructions: ['garbage'] }), // not usable (core wrong)
    ];
    const agg = aggregate(scores);
    expect(agg.usableDraftRate).toBeCloseTo(2 / 4);
    expect(agg.total).toBe(4);
    expect(agg.usable).toBe(2);
    // Every field carries an aggregate precision/recall (list fields) or accuracy.
    expect(agg.perField.ingredients.recall).toBeGreaterThan(0);
    expect(agg.perField.instructions.precision).toBeGreaterThanOrEqual(0);
  });
});
