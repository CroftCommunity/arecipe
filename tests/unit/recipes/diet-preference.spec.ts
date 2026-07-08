// Shared app-wide dietary "Only show me" preference: written by Settings
// (Phase 8), read by Browse's renderCurrent (Phase 3). Behaviors:
// - defaults to empty (no preference / show all) when unset
// - round-trips selected diet tokens through storage
// - saving an empty preference clears it back to the default
// - storage failure degrades to "no preference" without throwing
import { describe, expect, it } from 'vitest';
import { createDietPreference } from '../../../src/recipes/diet-preference.js';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
};

const brokenStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

describe('diet preference', () => {
  it('defaults to empty (no preference / show all) when unset', () => {
    expect(createDietPreference({ storage: memoryStorage() }).load()).toEqual([]);
  });

  it('round-trips selected diet tokens through storage', () => {
    const storage = memoryStorage();
    createDietPreference({ storage }).save(['dietVegetarian', 'dietVegan']);
    expect(createDietPreference({ storage }).load()).toEqual(['dietVegetarian', 'dietVegan']);
  });

  it('saving an empty preference clears it back to the default', () => {
    const storage = memoryStorage();
    const pref = createDietPreference({ storage });
    pref.save(['dietVegetarian']);
    pref.save([]);
    expect(createDietPreference({ storage }).load()).toEqual([]);
  });

  it('degrades to no preference when storage throws (private mode)', () => {
    const pref = createDietPreference({ storage: brokenStorage });
    expect(pref.load()).toEqual([]);
    expect(() => pref.save(['dietVegan'])).not.toThrow();
  });
});
