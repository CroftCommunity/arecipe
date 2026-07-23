// Sort model (pure): the daily-mix default + the name/date/cuisine/meal
// orderings behind the toolbar Sort control. No DOM, no clock — the day is
// injected as a seed so the shuffle is deterministic under test.
import { describe, expect, it } from 'vitest';
import {
  partitionByPlanned,
  SORT_LABELS,
  SORT_MODES,
  sortEntries,
  type SortMode,
} from '../../../src/recipes/sort.js';
import type { CachedRecipe } from '../../../src/recipes/cache.js';
import type { PlannedEntry } from '../../../src/recipes/planned-index.js';

const cached = (
  over: { name?: string; cuisine?: string; category?: string; createdAt?: string; uri?: string } = {},
): CachedRecipe => {
  const value: Record<string, unknown> = {};
  if (over.name !== undefined) value['name'] = over.name;
  if (over.cuisine !== undefined) value['recipeCuisine'] = over.cuisine;
  if (over.category !== undefined) value['recipeCategory'] = over.category;
  if (over.createdAt !== undefined) value['createdAt'] = over.createdAt;
  return {
    uri: over.uri ?? `at://did:plc:x/exchange.recipe.recipe/${over.name ?? 'r'}`,
    cid: 'cid',
    value,
    verified: true,
    cachedAt: '2026-07-08T00:00:00Z',
  };
};

const names = (entries: readonly CachedRecipe[]): (string | undefined)[] =>
  entries.map((e) => e.value['name'] as string | undefined);

describe('SORT_MODES / SORT_LABELS', () => {
  it('lists the five modes with default first, and a friendly label each', () => {
    expect(SORT_MODES).toEqual(['default', 'name', 'date', 'cuisine', 'meal']);
    expect(SORT_LABELS.default).toBe('Daily mix');
    for (const mode of SORT_MODES) expect(typeof SORT_LABELS[mode]).toBe('string');
  });
});

describe('sortEntries — name', () => {
  it('orders by name A→Z, case-insensitively', () => {
    const entries = [cached({ name: 'banana bread' }), cached({ name: 'Apple Pie' }), cached({ name: 'cherry cake' })];
    expect(names(sortEntries(entries, 'name'))).toEqual(['Apple Pie', 'banana bread', 'cherry cake']);
  });

  it('sorts untitled/missing names last', () => {
    const entries = [cached({ uri: 'at://x/1' }), cached({ name: 'Aioli' })];
    expect(names(sortEntries(entries, 'name'))).toEqual(['Aioli', undefined]);
  });
});

describe('sortEntries — date', () => {
  it('orders by createdAt newest-first', () => {
    const entries = [
      cached({ name: 'old', createdAt: '2026-07-01T00:00:00Z' }),
      cached({ name: 'new', createdAt: '2026-07-04T00:00:00Z' }),
      cached({ name: 'mid', createdAt: '2026-07-02T00:00:00Z' }),
    ];
    expect(names(sortEntries(entries, 'date'))).toEqual(['new', 'mid', 'old']);
  });

  it('sorts missing/invalid dates last', () => {
    const entries = [cached({ name: 'nodate' }), cached({ name: 'dated', createdAt: '2026-07-02T00:00:00Z' })];
    expect(names(sortEntries(entries, 'date'))).toEqual(['dated', 'nodate']);
  });
});

describe('sortEntries — cuisine / meal', () => {
  it('groups by cuisine A→Z then name within, nulls last', () => {
    const entries = [
      cached({ name: 'Souvlaki', cuisine: 'greek' }),
      cached({ name: 'Anon' }), // no cuisine → last
      cached({ name: 'Ziti', cuisine: 'italian' }),
      cached({ name: 'Baklava', cuisine: 'greek' }),
    ];
    expect(names(sortEntries(entries, 'cuisine'))).toEqual(['Baklava', 'Souvlaki', 'Ziti', 'Anon']);
  });

  it('groups by meal (category) A→Z then name within, nulls last', () => {
    const entries = [
      cached({ name: 'Pancakes', category: 'breakfast' }),
      cached({ name: 'Stew', category: 'dinner' }),
      cached({ name: 'Nothing' }), // no category → last
      cached({ name: 'Omelette', category: 'breakfast' }),
    ];
    expect(names(sortEntries(entries, 'meal'))).toEqual(['Omelette', 'Pancakes', 'Stew', 'Nothing']);
  });
});

describe('sortEntries — default (daily mix)', () => {
  const feed = [
    cached({ name: 'a', uri: 'at://x/a' }),
    cached({ name: 'b', uri: 'at://x/b' }),
    cached({ name: 'c', uri: 'at://x/c' }),
    cached({ name: 'd', uri: 'at://x/d' }),
    cached({ name: 'e', uri: 'at://x/e' }),
  ];

  it('is deterministic for a given day seed (stable within a day)', () => {
    const once = names(sortEntries(feed, 'default', { daySeed: '2026-07-23' }));
    const twice = names(sortEntries(feed, 'default', { daySeed: '2026-07-23' }));
    expect(once).toEqual(twice);
  });

  it('produces a different order on a different day', () => {
    const monday = names(sortEntries(feed, 'default', { daySeed: '2026-07-20' }));
    const tuesday = names(sortEntries(feed, 'default', { daySeed: '2026-07-21' }));
    expect(monday).not.toEqual(tuesday);
    // Same multiset — a shuffle, not a filter.
    expect([...monday].sort()).toEqual([...tuesday].sort());
  });
});

describe('sortEntries — purity', () => {
  it('returns a new array and does not mutate the input', () => {
    const entries = [cached({ name: 'b' }), cached({ name: 'a' })];
    const input = [...entries];
    const out = sortEntries(entries, 'name');
    expect(out).not.toBe(entries);
    expect(entries).toEqual(input); // original order untouched
  });

  it('accepts an empty feed', () => {
    expect(sortEntries([], 'name' as SortMode)).toEqual([]);
  });
});

// RUN-LAST-PLANNED D6: the planned-history sorts partition a "never-planned"
// tail group out of the ordered planned list rather than interleaving it.
describe('partitionByPlanned', () => {
  const idx = new Map<string, PlannedEntry>([
    ['at://old', { count: 2, lastPlanned: '2026-06-01', nextPlanned: null }],
    ['at://recent', { count: 5, lastPlanned: '2026-07-20', nextPlanned: null }],
    ['at://future', { count: 1, lastPlanned: null, nextPlanned: '2026-08-01' }],
  ]);
  const entries = [
    cached({ uri: 'at://old' }),
    cached({ uri: 'at://recent' }),
    cached({ uri: 'at://future' }),
    cached({ uri: 'at://never' }),
  ];

  it('Longest since planned orders oldest-planned first; never/future go to the tail', () => {
    const { planned, neverPlanned } = partitionByPlanned(entries, 'planned-longest', idx);
    expect(planned.map((e) => e.uri)).toEqual(['at://old', 'at://recent']);
    expect(neverPlanned.map((e) => e.uri).sort()).toEqual(['at://future', 'at://never']);
  });

  it('Recently planned orders newest-planned first', () => {
    const { planned } = partitionByPlanned(entries, 'planned-recent', idx);
    expect(planned.map((e) => e.uri)).toEqual(['at://recent', 'at://old']);
  });
});
