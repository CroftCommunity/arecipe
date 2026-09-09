// Shopping preferences (Account page): staples (assumed-on-hand ingredients) +
// AI-shopper custom instructions + ingredient substitutions. Defensive
// device-local store, matching the taste/diet/exclusions pattern. Behaviors:
//  - staples trim, drop blanks, de-dupe case-insensitively (first spelling wins)
//  - substitutions are KEYED (fromKey + optional variety): trim, drop unkeyed or
//    blank rows, de-dupe by key + scope
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

describe('normalizeSubstitutions — rules are stored by canonical KEY, never by raw text', () => {
  it('trims both sides, drops rows missing a key or a replacement, keeps order', () => {
    expect(
      normalizeSubstitutions([
        { from: ' ground hamburger ', fromKey: 'ground beef', to: ' ground turkey ' },
        { from: 'milk', fromKey: 'milk', to: '' }, // no replacement — dropped
        { from: 'xyzzy', fromKey: '', to: 'water' }, // never keyed — can never match — dropped
        { from: 'smoked paprika', fromKey: 'paprika', variety: 'smoked', to: 'chipotle powder' },
      ]),
    ).toEqual([
      { from: 'ground hamburger', fromKey: 'ground beef', to: 'ground turkey' },
      { from: 'smoked paprika', fromKey: 'paprika', variety: 'smoked', to: 'chipotle powder' },
    ]);
  });

  it('de-dupes by key + variety scope (first mapping wins); different scopes both stay', () => {
    expect(
      normalizeSubstitutions([
        { from: 'Milk', fromKey: 'milk', to: 'lactaid milk' },
        { from: 'milk', fromKey: 'milk', to: 'oat milk' },
        { from: 'whole milk', fromKey: 'milk', variety: 'whole', to: 'oat milk' },
      ]),
    ).toEqual([
      { from: 'Milk', fromKey: 'milk', to: 'lactaid milk' },
      { from: 'whole milk', fromKey: 'milk', variety: 'whole', to: 'oat milk' },
    ]);
  });
});

describe('createShoppingPrefs', () => {
  it('round-trips staples + instructions + substitutions + always-apply', () => {
    const storage = mem();
    const prefs = {
      staples: ['salt', 'pepper'],
      aiInstructions: 'prefer store brand',
      substitutions: [{ from: 'milk', fromKey: 'milk', to: 'lactaid milk' }],
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
      substitutions: [{ from: ' Beef ', fromKey: 'beef', to: ' Turkey ' }, { from: 'x', fromKey: 'x', to: '' }],
      alwaysApplySubstitutions: false,
    });
    const loaded = createShoppingPrefs({ storage }).load();
    expect(loaded.staples).toEqual(['Salt']);
    expect(loaded.substitutions).toEqual([{ from: 'Beef', fromKey: 'beef', to: 'Turkey' }]);
  });

  it('loads empty when unset or corrupt', () => {
    expect(createShoppingPrefs({ storage: mem() }).load()).toEqual(emptyShoppingPrefs());
    expect(createShoppingPrefs({ storage: mem({ 'shopping-prefs': '{bad' }) }).load()).toEqual(
      emptyShoppingPrefs(),
    );
  });

  it('drops a stored rule with no key (the pre-vocabulary free-text shape) — it could never match', () => {
    const storage = mem({ 'shopping-prefs': '{"staples":[],"aiInstructions":"","substitutions":[{"from":"flour","to":"almond flour"},{"from":"milk","fromKey":"milk","to":"oat milk"}]}' });
    expect(createShoppingPrefs({ storage }).load().substitutions).toEqual([{ from: 'milk', fromKey: 'milk', to: 'oat milk' }]);
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
