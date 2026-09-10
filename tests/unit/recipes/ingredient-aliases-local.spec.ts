// Ingredient corrections overlay (plans/2026-08-12-1 Phase 6). Device-local,
// mirroring the exclusions.ts overlay idiom: a cook confirms what an unmatched
// ingredient line IS, picking an existing key, and from then on that name
// resolves on this device. Entries are keyed on the unmatched NAME the cook
// saw ("freeze-dried strawberry"), so one confirmation covers every line that
// reads the same after quantity and prep come off. Corrections export as the
// seed-alias block for the next build review — the manual promotion path.
import { describe, expect, it } from 'vitest';
import { createIngredientCorrections } from '../../../src/recipes/ingredient-aliases-local.js';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const mem = (init: Record<string, string> = {}): StorageLike & { data: Map<string, string> } => {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

describe('createIngredientCorrections', () => {
  it('confirms a name → key and looks it up; unknown names are undefined', () => {
    const c = createIngredientCorrections({ storage: mem(), now: () => '2026-09-09T00:00:00Z' });
    expect(c.lookup('freeze-dried strawberry')).toBeUndefined();
    c.confirm('freeze-dried strawberry', 'strawberry');
    expect(c.lookup('freeze-dried strawberry')).toBe('strawberry');
    expect(c.all()).toEqual([{ name: 'freeze-dried strawberry', key: 'strawberry', confirmedAt: '2026-09-09T00:00:00Z' }]);
  });

  it('a later confirmation for the same name replaces the earlier one (correct, not append)', () => {
    const c = createIngredientCorrections({ storage: mem(), now: () => 't' });
    c.confirm('kombu broth', 'stock');
    c.confirm('kombu broth', 'dashi');
    expect(c.lookup('kombu broth')).toBe('dashi');
    expect(c.all()).toHaveLength(1);
  });

  it('normalizes the name the way the resolver reports it (case, whitespace)', () => {
    const c = createIngredientCorrections({ storage: mem(), now: () => 't' });
    c.confirm('  Freeze-Dried   Strawberry ', 'strawberry');
    expect(c.lookup('freeze-dried strawberry')).toBe('strawberry');
  });

  it('remove and clear; an empty overlay leaves no storage key behind', () => {
    const storage = mem();
    const c = createIngredientCorrections({ storage, now: () => 't' });
    c.confirm('a', 'x');
    c.confirm('b', 'y');
    c.remove('a');
    expect(c.all().map((e) => e.name)).toEqual(['b']);
    c.clear();
    expect(c.all()).toEqual([]);
    expect(storage.data.has('ingredient-corrections')).toBe(false);
  });

  it('persists across instances and reads a corrupt record as empty (never throws)', () => {
    const storage = mem();
    createIngredientCorrections({ storage, now: () => 't' }).confirm('kombu broth', 'dashi');
    expect(createIngredientCorrections({ storage }).lookup('kombu broth')).toBe('dashi');
    expect(createIngredientCorrections({ storage: mem({ 'ingredient-corrections': '{nope' }) }).all()).toEqual([]);
  });

  it('exports the seed-alias block: names grouped under their key, sorted, ready to paste into the seed', () => {
    const c = createIngredientCorrections({ storage: mem(), now: () => 't' });
    c.confirm('kombu broth', 'dashi');
    c.confirm('freeze-dried strawberry', 'strawberry');
    c.confirm('dashi stock', 'dashi');
    expect(c.exportSeedAliases()).toEqual({ dashi: ['dashi stock', 'kombu broth'], strawberry: ['freeze-dried strawberry'] });
  });
});
