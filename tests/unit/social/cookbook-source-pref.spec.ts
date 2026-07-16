// Cookbook source preference (Mine | Liked | Both): the signed-in cookbook
// remembers which source you last chose so it doesn't reset every visit.
// Defensive persistence with an injectable storage — mirrors createBrowsePrefs.
import { describe, expect, it } from 'vitest';
import { createSourcePref } from '../../../src/social/cookbook-source-pref.js';

const memoryStorage = (initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

const broken: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};

describe('createSourcePref', () => {
  it('returns the given fallback when nothing is stored', () => {
    expect(createSourcePref({ storage: memoryStorage() }).load('mine')).toBe('mine');
    expect(createSourcePref({ storage: memoryStorage() }).load('both')).toBe('both');
  });

  it('round-trips a saved source', () => {
    const storage = memoryStorage();
    createSourcePref({ storage }).save('liked');
    expect(createSourcePref({ storage }).load('mine')).toBe('liked');
  });

  it('ignores a stored value that is not a known source', () => {
    const pref = createSourcePref({ storage: memoryStorage({ 'cookbook-source': 'bogus' }) });
    expect(pref.load('mine')).toBe('mine');
  });

  it("treats the retired 'all' source as unknown (falls back to the default)", () => {
    const pref = createSourcePref({ storage: memoryStorage({ 'cookbook-source': 'all' }) });
    expect(pref.load('both')).toBe('both');
  });

  it('degrades to the fallback when storage throws (private mode)', () => {
    const pref = createSourcePref({ storage: broken });
    expect(pref.load('mine')).toBe('mine');
    expect(() => pref.save('liked')).not.toThrow();
  });
});
