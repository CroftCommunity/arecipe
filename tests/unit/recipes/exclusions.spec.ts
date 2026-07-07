// Exclusions, lite (forerunner of app.arecipe.mute.recipe): hide specific
// recipes by AT-URI. Behaviors:
// - the baked default list hides the known junk record (daffl.xyz "Test
//   Recipe") out of the box
// - hide/unhide persist through storage; unhiding a DEFAULT works (user
//   overrides curation)
// - storage failure degrades to the baked defaults
import { describe, expect, it } from 'vitest';
import { createExclusions, HIDDEN_BY_DEFAULT } from '../../../src/recipes/exclusions.js';

const JUNK =
  'at://did:plc:vspq46f5zmrlesaszlyfliy2/exchange.recipe.recipe/01KVQFHYF6PJP7KP84PNCJZ8K9';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
};

describe('exclusions', () => {
  it('hides the baked default junk record out of the box', () => {
    expect(HIDDEN_BY_DEFAULT).toContain(JUNK);
    const exclusions = createExclusions({ storage: memoryStorage() });
    expect(exclusions.isHidden(JUNK)).toBe(true);
    expect(exclusions.all()).toContain(JUNK);
  });

  it('hide persists and unhide overrides — even for baked defaults', () => {
    const storage = memoryStorage();
    const exclusions = createExclusions({ storage });
    exclusions.hide('at://did:plc:x/exchange.recipe.recipe/abc');
    exclusions.unhide(JUNK);
    const fresh = createExclusions({ storage });
    expect(fresh.isHidden('at://did:plc:x/exchange.recipe.recipe/abc')).toBe(true);
    expect(fresh.isHidden(JUNK)).toBe(false);
    expect(fresh.all()).not.toContain(JUNK);
  });

  it('degrades to baked defaults when storage throws', () => {
    const broken = {
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
    const exclusions = createExclusions({ storage: broken });
    expect(exclusions.isHidden(JUNK)).toBe(true);
    expect(() => exclusions.hide('at://x/y/z')).not.toThrow();
  });
});
