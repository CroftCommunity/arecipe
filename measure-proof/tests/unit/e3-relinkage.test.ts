import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateCorpus } from '../../src/corpus/generate.ts';
import { parseRegistry } from '../../src/registry/index.ts';
import { buildScenario, NAIVE, type Mitigations } from '../../src/attack/mitigations.ts';
import { a1Relink, a2Reorder, a3SingleOut } from '../../src/attack/attacks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const reg = parseRegistry(
  readFileSync(join(here, '..', '..', 'registry', 'metrics.yaml'), 'utf8'),
);
const corpus = generateCorpus({ seed: 42, profile: 'small' });

describe('E3 — A1 re-linkage', () => {
  it('naive store: source IP re-links flushes to devices at near-perfect precision AND recall', () => {
    const naive = buildScenario(corpus, reg, NAIVE);
    const s = a1Relink(naive);
    expect(s.precision).toBeGreaterThan(0.95);
    expect(s.recall).toBeGreaterThan(0.95);
  });

  it('dropping the IP collapses re-linkage (f1 falls sharply)', () => {
    const base = a1Relink(buildScenario(corpus, reg, NAIVE));
    const noIp = a1Relink(buildScenario(corpus, reg, { ...NAIVE, dropIp: true }));
    expect(noIp.f1).toBeLessThan(base.f1);
    expect(noIp.f1).toBeLessThan(0.5);
  });
});

describe('E3 — A2 re-ordering', () => {
  it('fixed cadence: arrival order recovers session order well above chance', () => {
    const s = a2Reorder(buildScenario(corpus, reg, NAIVE));
    expect(s.accuracy).toBeGreaterThan(0.75);
  });

  it('a jittered flush schedule pushes ordering back toward chance', () => {
    const base = a2Reorder(buildScenario(corpus, reg, NAIVE));
    const jittered = a2Reorder(buildScenario(corpus, reg, { ...NAIVE, jitterMs: 60_000_000 }));
    expect(jittered.accuracy).toBeLessThan(base.accuracy);
    expect(jittered.accuracy).toBeLessThan(0.65);
  });
});

describe('E3 — A3 singling out (small profile)', () => {
  it('a small combination of dimensions isolates an individual contributor', () => {
    const r = a3SingleOut(buildScenario(corpus, reg, NAIVE));
    expect(r.minCombo).toBeGreaterThanOrEqual(1);
    expect(r.minCombo).toBeLessThanOrEqual(3);
    expect(r.isolableAtMin).toBeGreaterThan(0);
  });

  it('min-count suppression + coarse time make singling out harder (fewer isolable)', () => {
    const base = a3SingleOut(buildScenario(corpus, reg, NAIVE));
    const hardened: Mitigations = { ...NAIVE, minCount: 2, coarseTimeMs: 30 * 24 * 3_600_000 };
    const after = a3SingleOut(buildScenario(corpus, reg, hardened), {
      timeBucketMs: 30 * 24 * 3_600_000,
    });
    // Fewer/coarser dimensions can only shrink the set of isolable contributors,
    // and the smallest isolating combo can only grow.
    expect(after.totalIsolable).toBeLessThanOrEqual(base.totalIsolable);
    expect(after.minCombo).toBeGreaterThanOrEqual(base.minCombo);
  });
});
