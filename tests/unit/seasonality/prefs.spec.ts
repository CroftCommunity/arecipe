// Feature B (seasonality) — the settings store. One toggle (default ON) and an
// explicit, never-inferred region (default a labelled constant — B-D2). Off
// means the whole feature disappears and ranking is the pre-feature baseline.
import { describe, expect, it } from 'vitest';
import { createSeasonalityPrefs } from '../../../src/seasonality/prefs.js';
import { DEFAULT_REGION } from '../../../src/seasonality/produce.js';

const fakeStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

describe('createSeasonalityPrefs', () => {
  it('defaults enabled ON and region to the documented default', () => {
    const prefs = createSeasonalityPrefs({ storage: fakeStorage() });
    expect(prefs.enabled()).toBe(true);
    expect(prefs.region()).toBe(DEFAULT_REGION);
  });

  it('persists an off toggle and a chosen region', () => {
    const storage = fakeStorage();
    const a = createSeasonalityPrefs({ storage });
    a.setEnabled(false);
    a.setRegion('southern-temperate');
    // A fresh instance reads the same backing store.
    const b = createSeasonalityPrefs({ storage });
    expect(b.enabled()).toBe(false);
    expect(b.region()).toBe('southern-temperate');
  });

  it('falls back to the default region for an unknown stored value', () => {
    const storage = fakeStorage();
    storage.setItem('seasonality-region', 'atlantis');
    const prefs = createSeasonalityPrefs({ storage });
    expect(prefs.region()).toBe(DEFAULT_REGION);
  });
});
