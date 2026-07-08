// Phase 9b: the "Social" settings panel prefs — viewer-side display toggles
// (localStorage, same defensive pattern as exclusions/starter prefs). Hide
// Comments is OFF by default (comments shown). Hide Likes lands in 9c on the
// same store. Behaviors:
// - hideComments defaults to false (comments shown)
// - setHideComments persists through storage and survives re-creation
// - storage failure (private mode) degrades to defaults, never throws
import { describe, expect, it } from 'vitest';
import { createSocialPrefs } from '../../../src/social/prefs.js';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
};

describe('createSocialPrefs', () => {
  it('hides comments = false by default (comments shown)', () => {
    const prefs = createSocialPrefs({ storage: memoryStorage() });
    expect(prefs.hideComments()).toBe(false);
  });

  it('persists Hide Comments through storage and across re-creation', () => {
    const storage = memoryStorage();
    const prefs = createSocialPrefs({ storage });
    prefs.setHideComments(true);
    expect(prefs.hideComments()).toBe(true);
    // A fresh instance over the same storage sees the choice.
    expect(createSocialPrefs({ storage }).hideComments()).toBe(true);
    prefs.setHideComments(false);
    expect(createSocialPrefs({ storage }).hideComments()).toBe(false);
  });

  it('hides likes = false by default; persists across re-creation', () => {
    const storage = memoryStorage();
    const prefs = createSocialPrefs({ storage });
    expect(prefs.hideLikes()).toBe(false);
    prefs.setHideLikes(true);
    expect(createSocialPrefs({ storage }).hideLikes()).toBe(true);
    // Independent of Hide Comments.
    expect(createSocialPrefs({ storage }).hideComments()).toBe(false);
  });

  it('degrades to defaults when storage throws (private mode)', () => {
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
    const prefs = createSocialPrefs({ storage: broken });
    expect(prefs.hideComments()).toBe(false);
    expect(() => prefs.setHideComments(true)).not.toThrow();
  });
});
