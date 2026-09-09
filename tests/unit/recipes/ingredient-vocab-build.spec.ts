// Vocabulary proposal logic (plans/2026-08-12-1 Phase 1). The build tool
// (scripts/build-ingredientkeys.mjs) is a thin shell over this pure core so the
// PROPOSAL groups lines exactly the way the RUNTIME resolver will read them —
// one canonicalHead, two callers. Auto-propose → human review → commit: the
// output here is a candidate, and every number it reports is by LINE WEIGHT.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { proposeVocabulary } from '../../../src/recipes/ingredient-vocab-build.js';
import { resolveIngredient } from '../../../src/recipes/ingredient-key.js';

const taxonomy = {
  variety: ['white', 'granulated', 'brown', 'smoked', 'all-purpose'],
  prep: ['chopped', 'minced'],
  quality: ['large', 'fresh'],
};

const rows: [string, number][] = [
  ['1 tsp salt', 40],
  ['salt to taste', 10],
  ['2 cups white granulated sugar', 12],
  ['1 cup sugar', 8],
  ['1/2 cup brown sugar', 5],
  ['2 bay leaves', 3],
  ['1 bay leaf', 2],
  ['2 green onions, sliced', 4],
  ['1 bunch scallions', 2],
  ['2 cups all purpose flour', 2],
  ['2 cups all-purpose flour', 6],
  ['1 cup dashi', 1],
  ['½ tsp', 1],
];

describe('proposeVocabulary', () => {
  it('groups lines by canonical head and counts by line weight', () => {
    const p = proposeVocabulary(rows, { taxonomy, minLines: 1 });
    expect(p.keys['salt']?.lines).toBe(50);
    expect(p.keys['sugar']?.lines).toBe(25);
    expect(p.keys['bay leaf']?.lines).toBe(5); // "leaves" folds to "leaf", no alias needed
  });

  it('reports descriptor variants under their key, for the reviewer to promote or keep', () => {
    const p = proposeVocabulary(rows, { taxonomy, minLines: 1 });
    expect(p.keys['sugar']?.variants).toEqual([
      { full: 'white granulated sugar', lines: 12 },
      { full: 'brown sugar', lines: 5 },
    ]);
  });

  it('attaches a seeded alias to its key instead of proposing a second key', () => {
    const p = proposeVocabulary(rows, { taxonomy, minLines: 1, seedAliases: { scallion: ['green onion'] } });
    expect(p.keys['green onion']).toBeUndefined();
    expect(p.keys['scallion']).toMatchObject({ lines: 6, aliases: ['green onion'] });
  });

  it('a seeded alias claims only its full phrase — "sweet pepper" never swallows plain "pepper"', () => {
    const wide: [string, number][] = [...rows, ['1 tsp pepper', 30], ['1 tsp black pepper', 20], ['1 sweet pepper, diced', 4]];
    const p = proposeVocabulary(wide, { taxonomy: { ...taxonomy, variety: [...taxonomy.variety, 'black', 'sweet'] }, minLines: 1, seedAliases: { 'bell pepper': ['sweet pepper'] } });
    expect(p.keys['bell pepper']).toMatchObject({ lines: 4, aliases: ['sweet pepper'] });
    expect(p.keys['pepper']).toMatchObject({ lines: 50, variants: [{ full: 'black pepper', lines: 20 }] });
  });

  it('a seeded key claims its descriptor-bearing full form before the descriptor peels', () => {
    const p = proposeVocabulary(rows, { taxonomy, minLines: 1, seedKeys: ['brown sugar'] });
    expect(p.keys['brown sugar']).toMatchObject({ lines: 5, aliases: [] });
    expect(p.keys['sugar']).toMatchObject({ lines: 20, variants: [{ full: 'white granulated sugar', lines: 12 }] });
    expect(resolveIngredient('1/2 cup brown sugar', p.vocabulary)).toMatchObject({ method: 'exact', key: 'brown sugar', variety: [] });
  });

  it('proposes a hyphen/space near-miss as an alias of the more frequent form', () => {
    const p = proposeVocabulary(rows, { taxonomy, minLines: 1 });
    expect(p.keys['flour']).toMatchObject({ lines: 8, aliases: ['all purpose flour'] });
    expect(p.keys['all purpose flour']).toBeUndefined();
  });

  it('drops heads under the line floor into the tail, never into keys', () => {
    const p = proposeVocabulary(rows, { taxonomy, minLines: 2 });
    expect(p.keys['dashi']).toBeUndefined();
    expect(p.tail).toEqual([{ head: 'dashi', lines: 1 }]);
  });

  it('measures its own coverage with the runtime resolver, by line weight, unparseable lines counted as misses', () => {
    const p = proposeVocabulary(rows, { taxonomy, minLines: 2 });
    const total = rows.reduce((n, [, c]) => n + c, 0);
    expect(p.coverage.lines).toBe(total);
    expect(p.coverage.matched).toBe(total - 1 - 1); // dashi (tail) + "½ tsp" (unparseable)
    expect(p.coverage.share).toBeCloseTo((total - 2) / total, 6);
    // Self-consistency: the vocabulary it emits resolves what it counted.
    expect(resolveIngredient('2 green onions, sliced', p.vocabulary)).toMatchObject({ method: 'exact', key: 'green onion' });
    expect(resolveIngredient('1 cup dashi', p.vocabulary)).toMatchObject({ method: 'unmatched' });
  });

  it('emits the taxonomy it was given and keys sorted by line weight', () => {
    const p = proposeVocabulary(rows, { taxonomy, minLines: 1 });
    expect(p.vocabulary.descriptors).toEqual(taxonomy);
    expect(Object.keys(p.vocabulary.keys).slice(0, 2)).toEqual(['salt', 'sugar']);
  });
});

describe('the shipped seed (scripts/ingredient-vocab-seed.json)', () => {
  const seed = JSON.parse(readFileSync(new URL('../../../scripts/ingredient-vocab-seed.json', import.meta.url), 'utf8')) as {
    seedKeys: string[];
    seedAliases: Record<string, string[]>;
  };

  it('never lists a seed key that is also a seed alias — the key would win and the synonym would die', () => {
    const aliases = new Set(Object.values(seed.seedAliases).flat());
    expect(seed.seedKeys.filter((k) => aliases.has(k))).toEqual([]);
  });

  it('never seeds a plain "ground/dried/fresh/smoked + spice" form as a key — those are key + variety by design', () => {
    const offenders = seed.seedKeys.filter((k) => /^(dried|fresh|smoked|ground) (cinnamon|cumin|coriander|ginger|nutmeg|turmeric|paprika|oregano|thyme|basil|rosemary|dill|parsley|mint|cilantro|clove|cloves|allspice|cardamom)$/.test(k));
    expect(offenders).toEqual([]);
  });
});
