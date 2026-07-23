import { describe, expect, it } from 'vitest';
import { generateCorpus } from '../../src/corpus/generate.ts';
import {
  analyzeRounding,
  DEAD_FEATURES,
  pageFeatureCounts,
  roundTo,
  thresholdSessions,
} from '../../src/rounding/round.ts';

describe('E8 — nearest-ten rounding mechanics', () => {
  it('rounds to the nearest ten (0-4→0, 5-14→10, …)', () => {
    expect(roundTo(0, 10)).toBe(0);
    expect(roundTo(4, 10)).toBe(0);
    expect(roundTo(5, 10)).toBe(10);
    expect(roundTo(9, 10)).toBe(10);
    expect(roundTo(14, 10)).toBe(10);
    expect(roundTo(15, 10)).toBe(20);
  });
});

describe('E8 — dead-feature signal under rounding', () => {
  it('small: genuinely-zero features are indistinguishable from lightly-used ones', () => {
    const corpus = generateCorpus({ seed: 42, profile: 'small' });
    const counts = pageFeatureCounts(corpus, DEAD_FEATURES);
    const a = analyzeRounding(counts, DEAD_FEATURES, 10);
    // Dead features exist and at least one live feature also rounds to 0.
    expect(a.dead).toBeGreaterThan(0);
    expect(a.aliveRoundingToZero).toBeGreaterThan(0);
    // => the dead-feature signal is destroyed: 0 no longer means "dead".
    expect(a.signalDestroyed).toBe(true);
  });

  it('medium: more traffic lifts live features clear of the rounding floor', () => {
    const small = analyzeRounding(
      pageFeatureCounts(generateCorpus({ seed: 42, profile: 'small' }), DEAD_FEATURES),
      DEAD_FEATURES,
      10,
    );
    const medium = analyzeRounding(
      pageFeatureCounts(generateCorpus({ seed: 42, profile: 'medium' }), DEAD_FEATURES),
      DEAD_FEATURES,
      10,
    );
    // Fewer live features are trapped in the rounds-to-zero bucket at medium.
    expect(medium.aliveRoundingToZero).toBeLessThanOrEqual(small.aliveRoundingToZero);
  });

  it('there is a traffic threshold above which rounding stops destroying the signal', () => {
    const t = thresholdSessions(42, DEAD_FEATURES, 10);
    expect(t.threshold).toBeGreaterThan(0);
    // Below the threshold the signal is destroyed; at/above it is intact.
    expect(t.sweep.find((r) => r.sessions < t.threshold)?.signalDestroyed).toBe(true);
    const atOrAbove = t.sweep.find((r) => r.sessions >= t.threshold);
    expect(atOrAbove?.signalDestroyed).toBe(false);
  });
});
