// Reach prefs (CB4): which cookbook sources are enabled — starter cooks +
// Bluesky follows + Bluesky followers. Stored in localStorage like the starter
// and social prefs (store the DISABLED set; default = all enabled). load()
// yields the ReachConfig that resolveCookbook consumes. Behaviors:
//   - default is all sources on
//   - disabling a source persists and load() reflects it (both edges)
//   - storage failure (private mode) degrades to all-on, never throws
import { describe, expect, it } from 'vitest';
import { createReachPrefs } from '../../../src/social/reach.js';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
};

describe('createReachPrefs', () => {
  it('defaults every source on (incl. the added/cook-follows source)', () => {
    const reach = createReachPrefs({ storage: memoryStorage() });
    expect(reach.load()).toEqual({ starters: true, added: true, follows: true, followers: true });
    expect(reach.isEnabled('followers')).toBe(true);
    expect(reach.isEnabled('added')).toBe(true);
  });

  it('disabling a source persists and load() reflects it (both edges)', () => {
    const storage = memoryStorage();
    createReachPrefs({ storage }).setEnabled('followers', false);
    const fresh = createReachPrefs({ storage });
    expect(fresh.isEnabled('followers')).toBe(false);
    expect(fresh.load()).toEqual({ starters: true, added: true, follows: true, followers: false });
    // Re-enabling clears it back to the default.
    fresh.setEnabled('followers', true);
    expect(createReachPrefs({ storage }).load().followers).toBe(true);
  });

  it('degrades to all-on when storage throws', () => {
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
    const reach = createReachPrefs({ storage: broken });
    expect(reach.load()).toEqual({ starters: true, added: true, follows: true, followers: true });
    expect(() => reach.setEnabled('follows', false)).not.toThrow();
  });
});
