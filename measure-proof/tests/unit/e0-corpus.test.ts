import { describe, expect, it } from 'vitest';
import {
  generateCorpus,
  serializeCorpus,
  type Corpus,
} from '../../src/corpus/generate.ts';

// E0 — the corpus is ground truth. Everything downstream (E2/E3/E8) reads it and
// nothing else. These tests pin the two properties the whole run leans on:
// determinism (a finding is reproducible) and honest population shape.

function pageOrder(c: Corpus, sessionIndex: number): string[] {
  const s = c.sessions[sessionIndex]!;
  return s.events.filter((e) => e.kind === 'page').map((e) => e.page);
}

describe('E0 corpus generator', () => {
  it('same seed produces byte-identical corpora', () => {
    const a = generateCorpus({ seed: 42, profile: 'small' });
    const b = generateCorpus({ seed: 42, profile: 'small' });
    expect(serializeCorpus(a)).toBe(serializeCorpus(b));
  });

  it('different seed produces a different corpus', () => {
    const a = generateCorpus({ seed: 1, profile: 'small' });
    const b = generateCorpus({ seed: 2, profile: 'small' });
    expect(serializeCorpus(a)).not.toBe(serializeCorpus(b));
  });

  it('honors an explicit session count', () => {
    const c = generateCorpus({ seed: 7, profile: 'small', sessions: 250 });
    expect(c.sessions.length).toBe(250);
    expect(c.meta.sessions).toBe(250);
  });

  it('small and medium sit in their declared (parameterised) ranges', () => {
    const small = generateCorpus({ seed: 3, profile: 'small' });
    const medium = generateCorpus({ seed: 3, profile: 'medium' });
    // Ranges are stand-ins (owner supplies real profiles later) but must be honest:
    // small ~ 100..1000/month, medium ~ order 50k/month.
    expect(small.sessions.length).toBeGreaterThanOrEqual(100);
    expect(small.sessions.length).toBeLessThanOrEqual(1000);
    expect(medium.sessions.length).toBeGreaterThanOrEqual(40_000);
    expect(medium.sessions.length).toBeLessThanOrEqual(60_000);
  });

  it('every session has an ordered page path of the requested lengths', () => {
    const c = generateCorpus({
      seed: 9,
      profile: 'small',
      sessions: 400,
      pathLengths: [
        { len: 2, weight: 1 },
        { len: 3, weight: 1 },
      ],
    });
    for (let i = 0; i < c.sessions.length; i++) {
      const path = pageOrder(c, i);
      expect(path.length === 2 || path.length === 3).toBe(true);
    }
  });

  it('path-length distribution is respected in aggregate (seeded, tolerant)', () => {
    const c = generateCorpus({
      seed: 11,
      profile: 'small',
      sessions: 1000,
      pathLengths: [
        { len: 2, weight: 3 },
        { len: 4, weight: 1 },
      ],
    });
    let two = 0;
    let four = 0;
    for (let i = 0; i < c.sessions.length; i++) {
      const n = pageOrder(c, i).length;
      if (n === 2) two++;
      if (n === 4) four++;
    }
    // 3:1 weighting — len-2 should dominate len-4 clearly.
    expect(two).toBeGreaterThan(four * 2);
  });

  it('assigns a stable device identity and coarse geo/ip per session (E3 oracle)', () => {
    const c = generateCorpus({ seed: 5, profile: 'small', sessions: 50 });
    for (const s of c.sessions) {
      expect(typeof s.deviceId).toBe('string');
      expect(s.deviceId.length).toBeGreaterThan(0);
      expect(typeof s.geo).toBe('string');
      expect(s.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    }
    // Multiple sessions per device must exist (re-linkage is only meaningful then).
    const devices = new Set(c.sessions.map((s) => s.deviceId));
    expect(devices.size).toBeLessThan(c.sessions.length);
  });
});
