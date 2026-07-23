import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateCorpus } from '../../src/corpus/generate.ts';
import { parseRegistry } from '../../src/registry/index.ts';
import { countEdges, edgeMultiset } from '../../src/flow/edges.ts';
import { divergenceByLength } from '../../src/flow/reconstruct.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const reg = parseRegistry(readFileSync(join(root, 'registry', 'metrics.yaml'), 'utf8'));

describe('E2 — declared edge counters + other bucket', () => {
  it('conserves volume: declared counters + other == all consecutive page pairs', () => {
    const corpus = generateCorpus({ seed: 42, profile: 'small' });
    const { counters, other, total } = countEdges(corpus, reg);
    const declaredSum = Object.values(counters).reduce((a, b) => a + b, 0);
    expect(declaredSum + other).toBe(total);
    // The declared set is incomplete, so undeclared traffic genuinely exists.
    expect(other).toBeGreaterThan(0);
  });

  it('other counts undeclared transitions as volume WITHOUT naming them', () => {
    const corpus = generateCorpus({ seed: 42, profile: 'small' });
    const { counters } = countEdges(corpus, reg);
    // Every counter key is a DECLARED nav metric name — no raw from->to pair,
    // no undeclared transition, ever appears as its own key.
    const declaredNames = new Set(
      reg.metrics.filter((m) => m.type === 'edge').map((m) => m.name),
    );
    for (const key of Object.keys(counters)) {
      expect(declaredNames.has(key)).toBe(true);
    }
    // e.g. recipe->editor is real traffic but undeclared: it must NOT surface.
    expect(Object.keys(counters)).not.toContain('recipe->editor');
    expect(Object.keys(counters)).not.toContain('nav_recipe__to__editor');
  });
});

describe('E2 — divergence of first-order flow reconstruction by path length', () => {
  it('reports TVD separately for length 2, 3, 4+ (recorded, not asserted small)', () => {
    const corpus = generateCorpus({ seed: 42, profile: 'medium' });
    const rows = divergenceByLength(corpus);
    const classes = rows.map((r) => r.lengthClass);
    expect(classes).toEqual(['2', '3', '4+']);
    for (const r of rows) {
      expect(r.tvd).toBeGreaterThanOrEqual(0);
      expect(r.tvd).toBeLessThanOrEqual(1);
      expect(r.paths).toBeGreaterThan(0);
    }
    // Length-2 reconstruction is essentially the bigram itself → near-exact.
    const two = rows.find((r) => r.lengthClass === '2')!;
    expect(two.tvd).toBeLessThan(0.05);
  });
});

describe('E2 — THE FALSIFICATION TEST (identical matrix, different journeys)', () => {
  it('two genuinely different path populations produce identical transition matrices', () => {
    // Shared hub B: A and D both pass through B, then split.
    const populationA = [
      ['A', 'B', 'C'],
      ['D', 'B', 'E'],
    ];
    const populationB = [
      ['A', 'B', 'E'],
      ['D', 'B', 'C'],
    ];
    // The two populations are genuinely different journeys.
    expect(populationA).not.toEqual(populationB);
    const setA = new Set(populationA.map((p) => p.join('>')));
    const setB = new Set(populationB.map((p) => p.join('>')));
    expect([...setA].some((p) => !setB.has(p))).toBe(true);

    // Yet their first-order edge multisets are IDENTICAL.
    const mA = edgeMultiset(populationA);
    const mB = edgeMultiset(populationB);
    expect(mA).toEqual(mB);
  });
});
