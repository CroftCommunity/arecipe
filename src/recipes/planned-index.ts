// RUN-LAST-PLANNED — the one pure derivation (D1). Answers "when was this last
// on my calendar?" and "how many times have I planned it?" WITHOUT ever storing
// a counter. The plan records are the source of truth; counts and dates are
// COMPUTED from them on demand. Any cache of this output is just a cache — being
// wrong is never a correctness problem because it is recomputed from the records.
//
// Pure: no clock (`now` is injected), no IO, and the input is never mutated.
// Calendar math is reused from meal-plan.ts / meal-plan-dates.ts — the SAME
// cumulative row-index mapping the app calendar and the .ics export use — rather
// than reimplemented here.

import type { LocalPlan } from './meal-plan-local.js';
import { dateForSlot } from './meal-plan-dates.js';
import { expandCalendar } from './meal-plan.js';

/** A recipe's derived planning history against an injected `now`. */
export interface PlannedEntry {
  /** Total slot occurrences, repeat-expanded. Counts undated plans too. */
  count: number;
  /** ISO date of the latest occurrence at or before `now`; null if none. */
  lastPlanned: string | null;
  /** ISO date of the earliest occurrence strictly after `now`; null if none. */
  nextPlanned: string | null;
}

type Accum = { count: number; last: string | null; next: string | null };

/** Build the recipe-URI → planning-history map from plan records.
 *
 * Keyed by the recipe AT-URI from each slot's strongRef; slots with no recipe
 * contribute nothing. A week with `repeat: 4` contributes four occurrences per
 * filled slot (repeat-expanded via `expandCalendar`). Dates derive only for
 * plans that carry a `startDate` — an undated plan still adds to `count` but can
 * set no last/next. Deterministic: the returned map is ordered by recipe URI, so
 * two calls on identical input give identical output. */
export const buildPlannedIndex = (
  plans: readonly LocalPlan[],
  now: Date,
): Map<string, PlannedEntry> => {
  const nowIso = now.toISOString().slice(0, 10);
  const acc = new Map<string, Accum>();

  for (const plan of plans) {
    const start = plan.startDate;
    // Cumulative row index across the expanded calendar (repeats laid out
    // consecutively) — mirrors buildCalendarRows / planEvents exactly.
    let rowIndex = 0;
    for (const cw of expandCalendar(plan.weeks)) {
      const src = plan.weeks[cw.week - 1];
      if (src === undefined) {
        rowIndex += 1;
        continue;
      }
      src.days.forEach((slot, dayIndex) => {
        const date = start !== undefined ? dateForSlot(start, rowIndex, dayIndex) : null;
        for (const meal of slot.meals) {
          const uri = meal.recipe.uri;
          const entry = acc.get(uri) ?? { count: 0, last: null, next: null };
          entry.count += 1;
          if (date !== null) {
            if (date <= nowIso) {
              if (entry.last === null || date > entry.last) entry.last = date;
            } else if (entry.next === null || date < entry.next) {
              entry.next = date;
            }
          }
          acc.set(uri, entry);
        }
      });
      rowIndex += 1;
    }
  }

  const out = new Map<string, PlannedEntry>();
  for (const uri of [...acc.keys()].sort()) {
    const e = acc.get(uri) as Accum;
    out.set(uri, { count: e.count, lastPlanned: e.last, nextPlanned: e.next });
  }
  return out;
};

/** Whole days from `iso` (a floating YYYY-MM-DD) up to `now`, in UTC to match
 * the floating-date convention. Negative for future dates. Pure. */
const daysAgo = (iso: string, now: Date): number => {
  const [y, m, d] = iso.split('-').map(Number);
  const then = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - then) / 86_400_000);
};

/** A coarse "how long ago" phrase for a planned date (day → week → month →
 * year granularity), e.g. "today", "yesterday", "3 days ago", "2 weeks ago".
 * Pure — `now` injected. */
export const relativePlanned = (iso: string, now: Date): string => {
  const days = daysAgo(iso, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} ${w === 1 ? 'week' : 'weeks'} ago`;
  }
  if (days < 365) {
    const mo = Math.floor(days / 30);
    return `${mo} ${mo === 1 ? 'month' : 'months'} ago`;
  }
  const yr = Math.floor(days / 365);
  return `${yr} ${yr === 1 ? 'year' : 'years'} ago`;
};

/** The recipe-page footer copy for a planned entry (D5): `last planned
 * {relative} · planned {n} times`, with `planned once` special-cased. When the
 * recipe has only future (or undated) occurrences, the "last planned" clause is
 * dropped — there is no past date to describe. Pure. */
export const describePlanned = (entry: PlannedEntry, now: Date): string => {
  const times = entry.count === 1 ? 'planned once' : `planned ${entry.count} times`;
  if (entry.lastPlanned === null) return times;
  return `last planned ${relativePlanned(entry.lastPlanned, now)} · ${times}`;
};

/** The content-identity fingerprint of a plan set (D2), for the cache's
 * fail-closed staleness check. Sorted so it is order-independent.
 *
 * The design calls for "the sorted list of source plan-record CIDs"; the local
 * buffer (LocalPlan) carries no CID, so we use `id@updatedAt` as the equivalent
 * content identity — `store.save` bumps `updatedAt` on every mutation, so any
 * add/edit/remove changes the fingerprint, which is all the staleness check
 * needs. Being a proxy is harmless: a mismatch only ever means "recompute". */
export const fingerprintOf = (plans: readonly LocalPlan[]): string[] =>
  plans.map((p) => `${p.id}@${p.updatedAt}`).sort();
