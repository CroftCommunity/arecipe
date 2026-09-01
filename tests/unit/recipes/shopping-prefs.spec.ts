// Shopping preferences (Account page): staples (assumed-on-hand ingredients) +
// AI-shopper custom instructions. Defensive device-local store, matching the
// taste/diet/exclusions pattern. Behaviors:
//  - staples trim, drop blanks, de-dupe case-insensitively (first spelling wins)
//  - round-trips staples + instructions
//  - degrades to empty on unset / corrupt / blocked storage
//  - clears the key back to empty when nothing is set
import { describe, expect, it } from 'vitest';
import {
  createShoppingPrefs,
  emptyShoppingPrefs,
  normalizeStaples,
} from '../../../src/recipes/shopping-prefs.js';

const mem = (
  initial: Record<string, string> = {},
): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { peek: (k: string) => string | null } => {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    peek: (k) => m.get(k) ?? null,
  };
};

describe('normalizeStaples', () => {
  it('trims, drops blanks, and de-dupes case-insensitively (first spelling wins)', () => {
    expect(normalizeStaples([' Salt ', 'salt', 'SALT', '', '  ', 'Pepper'])).toEqual(['Salt', 'Pepper']);
  });
});

describe('createShoppingPrefs', () => {
  it('round-trips staples + instructions', () => {
    const storage = mem();
    const prefs = { staples: ['salt', 'pepper'], aiInstructions: 'prefer store brand' };
    createShoppingPrefs({ storage }).save(prefs);
    expect(createShoppingPrefs({ storage }).load()).toEqual(prefs);
  });

  it('normalizes staples on save', () => {
    const storage = mem();
    createShoppingPrefs({ storage }).save({ staples: [' Salt ', 'salt', ''], aiInstructions: '' });
    expect(createShoppingPrefs({ storage }).load().staples).toEqual(['Salt']);
  });

  it('loads empty when unset or corrupt', () => {
    expect(createShoppingPrefs({ storage: mem() }).load()).toEqual(emptyShoppingPrefs());
    expect(createShoppingPrefs({ storage: mem({ 'shopping-prefs': '{bad' }) }).load()).toEqual(
      emptyShoppingPrefs(),
    );
  });

  it('clears the key when nothing is set', () => {
    const storage = mem({ 'shopping-prefs': '{"staples":["salt"],"aiInstructions":""}' });
    createShoppingPrefs({ storage }).save(emptyShoppingPrefs());
    expect(storage.peek('shopping-prefs')).toBeNull();
  });
});
