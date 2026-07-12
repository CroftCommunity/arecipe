// Shared, pure date-derivation for the expanded meal-plan calendar. This is the
// SINGLE source of truth for "which real date does each day-slot fall on" — the
// planner and shared view (src/pages/meals.ts) AND the .ics feed (the scheduled
// generator) both consume it, so their dates cannot drift.
//
// The subtlety it encapsulates: a week's `repeat` stamps CONSECUTIVE calendar
// weeks, so the date base is the running position in the EXPANDED calendar
// (`rowIndex`), never the source week index. Getting that wrong is invisible
// until a repeat>1 plan shifts every later week. Reuses `expandCalendar` (the
// repeat-stamp + clamp logic) and `dateForSlot` (the floating/UTC date math) so
// there is exactly one implementation of each.

import { expandCalendar } from './meal-plan.js';
import { dateForSlot } from './meal-plan-dates.js';

export type DatedDay<S> = {
  /** 0–6 within the week (Mon–Sun). */
  dayIndex: number;
  /** Floating ISO date (YYYY-MM-DD), or null when the plan has no `startDate`
   * anchor (or the anchor is unparseable). */
  date: string | null;
  slot: S;
};

export type DatedRow<S> = {
  /** Running 0-based position in the expanded calendar → the 7-day date offset. */
  rowIndex: number;
  /** 1-based source week this row was stamped from. */
  weekIndex: number;
  /** 1-based occurrence within that week's repeat count. */
  occurrenceIndex: number;
  /** The source week's repeat count (drives "rep of N" labels). */
  repeat: number;
  days: DatedDay<S>[];
};

/** Expand a plan's weeks (each stamped `repeat` times, in order) and pin every
 * day-slot to its real date. `startDate` is the plan's first Monday (floating
 * ISO YYYY-MM-DD); when absent or invalid, every `date` is null (the app renders
 * abstract "Week N" labels, the feed skips the plan). Pure — no clock, no DOM. */
export const deriveDatedRows = <S>(
  weeks: readonly { repeat?: number; days: S[] }[],
  startDate: string | undefined,
): DatedRow<S>[] => {
  const rows: DatedRow<S>[] = [];
  let rowIndex = 0; // position in the flat calendar → the date offset (7 days each)
  for (const cw of expandCalendar(weeks)) {
    const src = weeks[cw.week - 1];
    if (src === undefined) {
      rowIndex += 1;
      continue;
    }
    const base = rowIndex;
    rows.push({
      rowIndex: base,
      weekIndex: cw.week,
      occurrenceIndex: cw.rep,
      repeat: src.repeat ?? 1,
      days: src.days.map((slot, dayIndex) => ({
        dayIndex,
        date: startDate !== undefined ? dateForSlot(startDate, base, dayIndex) : null,
        slot,
      })),
    });
    rowIndex += 1;
  }
  return rows;
};

/** A day-slot in the flat calendar: its date plus the structural coordinates of
 * the row it came from. */
export type DatedSlot<S> = DatedDay<S> & {
  rowIndex: number;
  weekIndex: number;
  occurrenceIndex: number;
  repeat: number;
};

/** Flat view of {@link deriveDatedRows}: every dated day-slot, in calendar order,
 * each carrying its row's coordinates. The feed's natural input. */
export const deriveDatedSlots = <S>(
  weeks: readonly { repeat?: number; days: S[] }[],
  startDate: string | undefined,
): DatedSlot<S>[] =>
  deriveDatedRows(weeks, startDate).flatMap((row) =>
    row.days.map((d) => ({
      rowIndex: row.rowIndex,
      weekIndex: row.weekIndex,
      occurrenceIndex: row.occurrenceIndex,
      repeat: row.repeat,
      ...d,
    })),
  );
