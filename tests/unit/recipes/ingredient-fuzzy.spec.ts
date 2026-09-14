// The closed-set fuzzy tier (plans/2026-08-12-1 M4, Phases 7–8 as built): a
// character-trigram cosine over the vocabulary's keys and aliases. It can only
// PICK an existing key, never invent one; it answers only above a threshold;
// and it runs only after every deterministic path (overlay, exact, alias,
// coordination) came up empty. Its answer is labeled `fuzzy` and carries its
// score, so the UI can show "closest match" and ask the cook to confirm.
import { describe, expect, it } from 'vitest';
import { FUZZY_THRESHOLD, fuzzyMatch } from '../../../src/recipes/ingredient-fuzzy.js';
import { resolveIngredient, resolveLine, type Vocabulary } from '../../../src/recipes/ingredient-key.js';

const taxonomy = { variety: ['smoked'], prep: ['chopped'], quality: ['fresh'] };
const vocab: Vocabulary = {
  descriptors: taxonomy,
  keys: {
    turmeric: { aliases: [] },
    'pork shoulder': { aliases: [] },
    'tomato paste': { aliases: ['tomato puree'] },
    avocado: { aliases: [] },
    banana: { aliases: [] },
    salt: { aliases: [] },
    pepper: { aliases: [] },
    'vegetable broth': { aliases: ['vegetable stock'] },
    water: { aliases: [] },
  },
};

describe('fuzzyMatch — closed-set, thresholded', () => {
  it.each([
    ['tumeric', 'turmeric'],
    ['pork shoulder roast', 'pork shoulder'],
    ['can of tomato paste', 'tomato paste'],
    ['haas avocado', 'avocado'],
    ['tomatoe puree', 'tomato paste'], // through an alias
  ])('%j → %j', (name, key) => {
    const m = fuzzyMatch(name, vocab);
    expect(m?.key).toBe(key);
    expect(m?.score).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
  });

  it('answers nothing below the threshold — a near-miss is not a match', () => {
    expect(fuzzyMatch('banana ketchup', vocab)).toBeNull(); // shares "banana", is not a banana
    expect(fuzzyMatch('xyzzy', vocab)).toBeNull();
    expect(fuzzyMatch('', vocab)).toBeNull();
  });

  it('only ever names a key the vocabulary has', () => {
    for (const name of ['tumeric', 'pork shoulder roast', 'avacado', 'tomatoe']) {
      const m = fuzzyMatch(name, vocab);
      if (m !== null) expect(vocab.keys[m.key]).toBeDefined();
    }
  });

  it('the threshold is a named constant between 0.7 and 0.8 (Phase 0-style measurement: 90.5% at 0.7, 87.5% at 0.8)', () => {
    expect(FUZZY_THRESHOLD).toBeGreaterThanOrEqual(0.7);
    expect(FUZZY_THRESHOLD).toBeLessThanOrEqual(0.8);
  });
});

describe('the resolver falls through to fuzzy only when asked, and only last', () => {
  it('is off by default: an unknown spelling stays unmatched', () => {
    expect(resolveIngredient('1 tsp tumeric', vocab)).toMatchObject({ method: 'unmatched', name: 'tumeric' });
  });

  it('with fuzzy on, an unknown spelling resolves, labeled, with its score', () => {
    const r = resolveIngredient('1 tsp tumeric', vocab, { fuzzy: true });
    expect(r).toMatchObject({ method: 'fuzzy', key: 'turmeric', head: 'tumeric' });
    expect(r.method === 'fuzzy' ? r.score : 0).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
  });

  it('never runs when a deterministic path answered: exact, alias, overlay all beat it', () => {
    expect(resolveIngredient('1 tsp turmeric', vocab, { fuzzy: true })).toMatchObject({ method: 'exact' });
    expect(resolveIngredient('2 tbsp tomato puree', vocab, { fuzzy: true })).toMatchObject({ method: 'alias' });
    const overlay = (n: string): string | undefined => (n === 'tumeric' ? 'pepper' : undefined);
    expect(resolveIngredient('1 tsp tumeric', vocab, { fuzzy: true, overlay })).toMatchObject({ method: 'overlay', key: 'pepper' });
  });

  it('coordination still wins: "vegetable broth or water" is two parts, not a fuzzy hit on the whole', () => {
    const line = resolveLine('2 cups vegetable broth or water', vocab, { fuzzy: true });
    expect(line.joiner).toBe('or');
    expect(line.parts.map((p) => p.method)).toEqual(['exact', 'exact']);
  });

  it('a part of a coordinated line can be fuzzy while the other is exact', () => {
    const line = resolveLine('salt and tumeric', vocab, { fuzzy: true });
    expect(line.parts.map((p) => (p.method === 'unmatched' ? null : `${p.method}:${p.key}`))).toEqual(['exact:salt', 'fuzzy:turmeric']);
  });
});
