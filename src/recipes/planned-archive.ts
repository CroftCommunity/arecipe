// RUN-LAST-PLANNED — archive partition + stats (D7, D8). An archive is a VIEW,
// not a deletion: nothing here (or anywhere in this run) deletes, trims, or
// rewrites a plan record. A meal-plan range whose derived dates have entirely
// passed is partitioned into `archived`; a range still touching or ahead of
// `now` stays `active`. Stats are derived from the SAME planned index — no new
// data, no stored aggregate. Pure: `now` injected, no clock, no IO, no mutation.

import type { LocalPlan } from './meal-plan-local.js';
import { dateForSlot } from './meal-plan-dates.js';
import { expandCalendar } from './meal-plan.js';
import type { PlannedEntry } from './planned-index.js';

/** The derived first/last calendar date a plan covers, or null when the plan is
 * undated (no `startDate`) or its anchor is unparseable — such a plan has no
 * real dates and so can never be "entirely passed" (it stays active). */
export const planDateSpan = (plan: LocalPlan): { start: string; end: string } | null => {
  const start = plan.startDate;
  if (start === undefined) return null;
  const rows = expandCalendar(plan.weeks).length;
  if (rows === 0) return null;
  const end = dateForSlot(start, rows - 1, 6); // last day of the last expanded week
  if (end === null) return null;
  return { start, end };
};

/** Partition dated ranges into active vs. archived against `now`. A range whose
 * `end` is strictly before today is archived; a range ending today or later
 * (including one spanning `now`) stays active. Generic so the caller can carry
 * any payload (e.g. the source plan) alongside the dates. */
export const partitionRanges = <T extends { end: string }>(
  ranges: readonly T[],
  now: Date,
): { active: T[]; archived: T[] } => {
  const nowIso = now.toISOString().slice(0, 10);
  const active: T[] = [];
  const archived: T[] = [];
  for (const range of ranges) {
    (range.end < nowIso ? archived : active).push(range);
  }
  return { active, archived };
};

/** Partition whole plans into active vs. archived (D7). An undated plan has no
 * derived dates and so can never be "entirely passed" — it stays active. A dated
 * plan is archived once its last date is strictly before today. Nothing is
 * deleted, trimmed, or rewritten — this is a VIEW. */
export const partitionPlans = (
  plans: readonly LocalPlan[],
  now: Date,
): { active: LocalPlan[]; archived: LocalPlan[] } => {
  const undated: LocalPlan[] = [];
  const dated: { plan: LocalPlan; start: string; end: string }[] = [];
  for (const plan of plans) {
    const span = planDateSpan(plan);
    if (span === null) undated.push(plan);
    else dated.push({ plan, ...span });
  }
  const { active, archived } = partitionRanges(dated, now);
  return { active: [...undated, ...active.map((r) => r.plan)], archived: archived.map((r) => r.plan) };
};

export interface PlannedStats {
  /** Total planned meals (sum of every recipe's occurrence count). */
  totalPlanned: number;
  /** How many distinct recipes have been planned at least once. */
  distinctRecipes: number;
  /** The most commonly planned recipe (URI + count), or null when none. */
  mostCommon: { uri: string; count: number } | null;
  /** The span of dated occurrences (earliest..latest across last/next), or null. */
  span: { first: string; last: string } | null;
}

/** Derive the archive stats block from a planned index (D8). */
export const plannedStats = (index: Map<string, PlannedEntry>): PlannedStats => {
  let totalPlanned = 0;
  let distinctRecipes = 0;
  let mostCommon: { uri: string; count: number } | null = null;
  let first: string | null = null;
  let last: string | null = null;

  for (const [uri, entry] of index) {
    if (entry.count <= 0) continue;
    totalPlanned += entry.count;
    distinctRecipes += 1;
    // Tie-break by URI so "most common" is deterministic.
    if (
      mostCommon === null ||
      entry.count > mostCommon.count ||
      (entry.count === mostCommon.count && uri < mostCommon.uri)
    ) {
      mostCommon = { uri, count: entry.count };
    }
    for (const date of [entry.lastPlanned, entry.nextPlanned]) {
      if (date === null) continue;
      if (first === null || date < first) first = date;
      if (last === null || date > last) last = date;
    }
  }

  return {
    totalPlanned,
    distinctRecipes,
    mostCommon,
    span: first !== null && last !== null ? { first, last } : null,
  };
};
