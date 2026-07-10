// App-wide taste preference: standing "Only show me" / "Never show me" filters
// by meal category and cuisine, chosen from curated vocabularies. Distinct from
// the diet preference (a different axis). Pure core: a defensive store + a
// match predicate applied across the feeds. Behaviors:
//  - never: a recipe whose cuisine/category is on a "never" list is hidden
//  - only: when an "only" list is set, a recipe must match it (missing = out)
//  - case-insensitive (corpus values vary in casing)
//  - store degrades to "no preference" on blocked/corrupt storage
import { describe, expect, it } from 'vitest';
import {
  CUISINE_OPTIONS,
  MEAL_OPTIONS,
  createTastePreference,
  matchesTaste,
  type TastePreference,
} from '../../../src/recipes/taste-preference.js';

const empty = (): TastePreference => ({
  only: { cuisine: [], category: [] },
  never: { cuisine: [], category: [] },
});

describe('curated vocabularies', () => {
  it('offer stable, lowercase-value meal + cuisine options', () => {
    expect(MEAL_OPTIONS.length).toBeGreaterThan(4);
    expect(CUISINE_OPTIONS.length).toBeGreaterThan(4);
    for (const o of [...MEAL_OPTIONS, ...CUISINE_OPTIONS]) {
      expect(o.value).toBe(o.value.toLowerCase());
      expect(o.label.length).toBeGreaterThan(0);
    }
  });
});

describe('matchesTaste', () => {
  it('passes everything when no preference is set', () => {
    expect(matchesTaste({ cuisine: 'Italian', category: 'dinner' }, empty())).toBe(true);
    expect(matchesTaste({ cuisine: null, category: null }, empty())).toBe(true);
  });

  it('hides a recipe whose category is on the "never" list (case-insensitive)', () => {
    const pref = { ...empty(), never: { cuisine: [], category: ['dessert'] } };
    expect(matchesTaste({ cuisine: null, category: 'Dessert' }, pref)).toBe(false);
    expect(matchesTaste({ cuisine: null, category: 'dinner' }, pref)).toBe(true);
  });

  it('hides a recipe whose cuisine is on the "never" list', () => {
    const pref = { ...empty(), never: { cuisine: ['thai'], category: [] } };
    expect(matchesTaste({ cuisine: 'Thai', category: 'dinner' }, pref)).toBe(false);
  });

  it('with an "only" cuisine set, keeps only matching recipes (missing cuisine = out)', () => {
    const pref = { ...empty(), only: { cuisine: ['italian', 'greek'], category: [] } };
    expect(matchesTaste({ cuisine: 'Italian', category: 'dinner' }, pref)).toBe(true);
    expect(matchesTaste({ cuisine: 'Thai', category: 'dinner' }, pref)).toBe(false);
    expect(matchesTaste({ cuisine: null, category: 'dinner' }, pref)).toBe(false);
  });

  it('never wins over only (an only-cuisine that is also never-category is out)', () => {
    const pref = {
      only: { cuisine: ['italian'], category: [] },
      never: { cuisine: [], category: ['dessert'] },
    };
    expect(matchesTaste({ cuisine: 'italian', category: 'dessert' }, pref)).toBe(false);
  });
});

describe('createTastePreference', () => {
  const mem = (initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
    const m = new Map(Object.entries(initial));
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
    };
  };

  it('round-trips a preference', () => {
    const storage = mem();
    const pref = { only: { cuisine: ['greek'], category: [] }, never: { cuisine: [], category: ['dessert'] } };
    createTastePreference({ storage }).save(pref);
    expect(createTastePreference({ storage }).load()).toEqual(pref);
  });

  it('loads an empty preference when unset or corrupt', () => {
    expect(createTastePreference({ storage: mem() }).load()).toEqual(empty());
    expect(createTastePreference({ storage: mem({ 'taste-preference': '{bad' }) }).load()).toEqual(empty());
  });
});
