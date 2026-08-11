// Shopping preferences (Account page): staples (assumed-on-hand ingredients) +
// AI-shopper custom instructions + ingredient substitutions. Defensive
// device-local store, matching the taste/diet/exclusions pattern. Behaviors:
//  - staples trim, drop blanks, de-dupe case-insensitively (first spelling wins)
//  - substitutions trim from/to, drop rows missing either side, de-dupe by `from`
//  - round-trips staples + instructions + substitutions + always-apply flag
//  - degrades to empty on unset / corrupt / blocked storage
//  - clears the key back to empty when nothing is set
import { describe, expect, it } from 'vitest';
import {
  createShoppingPrefs,
  emptyShoppingPrefs,
  normalizeStaples,
  normalizeSubstitutions,
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

describe('normalizeSubstitutions', () => {
  it('trims both sides, drops rows missing either side, keeps order', () => {
    expect(
      normalizeSubstitutions([
        { from: ' ground hamburger ', to: ' ground turkey ' },
        { from: 'milk', to: '' }, // no replacement — dropped
        { from: '', to: 'water' }, // no original — dropped
        { from: 'milk', to: 'lactaid milk' },
      ]),
    ).toEqual([
      { from: 'ground hamburger', to: 'ground turkey' },
      { from: 'milk', to: 'lactaid milk' },
    ]);
  });

  it('de-dupes by `from` case-insensitively (first spelling + mapping wins)', () => {
    expect(
      normalizeSubstitutions([
        { from: 'Milk', to: 'lactaid milk' },
        { from: 'milk', to: 'oat milk' },
      ]),
    ).toEqual([{ from: 'Milk', to: 'lactaid milk' }]);
  });
});

describe('createShoppingPrefs', () => {
  it('round-trips staples + instructions + substitutions + always-apply', () => {
    const storage = mem();
    const prefs = {
      staples: ['salt', 'pepper'],
      aiInstructions: 'prefer store brand',
      substitutions: [{ from: 'milk', to: 'lactaid milk' }],
      alwaysApplySubstitutions: true,
    };
    createShoppingPrefs({ storage }).save(prefs);
    expect(createShoppingPrefs({ storage }).load()).toEqual(prefs);
  });

  it('normalizes staples and substitutions on save', () => {
    const storage = mem();
    createShoppingPrefs({ storage }).save({
      staples: [' Salt ', 'salt', ''],
      aiInstructions: '',
      substitutions: [{ from: ' Beef ', to: ' Turkey ' }, { from: 'x', to: '' }],
      alwaysApplySubstitutions: false,
    });
    const loaded = createShoppingPrefs({ storage }).load();
    expect(loaded.staples).toEqual(['Salt']);
    expect(loaded.substitutions).toEqual([{ from: 'Beef', to: 'Turkey' }]);
  });

  it('loads empty when unset or corrupt', () => {
    expect(createShoppingPrefs({ storage: mem() }).load()).toEqual(emptyShoppingPrefs());
    expect(createShoppingPrefs({ storage: mem({ 'shopping-prefs': '{bad' }) }).load()).toEqual(
      emptyShoppingPrefs(),
    );
  });

  it('tolerates a legacy record with no substitution fields', () => {
    const storage = mem({ 'shopping-prefs': '{"staples":["salt"],"aiInstructions":"x"}' });
    const loaded = createShoppingPrefs({ storage }).load();
    expect(loaded.substitutions).toEqual([]);
    expect(loaded.alwaysApplySubstitutions).toBe(false);
  });

  it('clears the key when nothing is set', () => {
    const storage = mem({ 'shopping-prefs': '{"staples":["salt"],"aiInstructions":""}' });
    createShoppingPrefs({ storage }).save(emptyShoppingPrefs());
    expect(storage.peek('shopping-prefs')).toBeNull();
  });
});
