// Published-plans month calendar (read-only). The "Your published plans"
// subpage lists plan records; this module derives the month-grid view of them:
// merge every dated plan into one date → meals map, lay a YYYY-MM month out as
// a Monday-first grid of ISO dates, and pick which month to open on. All pure
// and clock-free (the caller supplies "today") — the DOM wiring lives in the
// page. Dates reuse the plan date math (floating, UTC-parsed, no timezone
// conversion) so the calendar shows the same days everywhere.

import { dateForSlot } from './meal-plan-dates.js';
import { expandCalendar } from './meal-plan.js';
import type { LocalMeal, LocalPlan } from './meal-plan-local.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Parse a strict `YYYY-MM` month key into { year, month0 }. Null on anything
 *  malformed or out of range (month 01–12). */
const parseMonthKey = (month: string): { year: number; month0: number } | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (m === null) return null;
  const year = Number(m[1]);
  const month0 = Number(m[2]) - 1;
  if (month0 < 0 || month0 > 11) return null;
  return { year, month0 };
};

/** The `YYYY-MM` month key of an ISO `YYYY-MM-DD` date. Null when malformed. */
export const monthOfDate = (isoDate: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const key = isoDate.slice(0, 7);
  return parseMonthKey(key) === null ? null : key;
};

/** A human month title, e.g. "July 2026". Null on a malformed key. */
export const monthLabel = (month: string): string | null => {
  const parsed = parseMonthKey(month);
  if (parsed === null) return null;
  return `${MONTH_NAMES[parsed.month0]} ${parsed.year}`;
};

/** The month key `delta` months away (may be negative), rolling over years. */
export const addMonths = (month: string, delta: number): string | null => {
  const parsed = parseMonthKey(month);
  if (parsed === null) return null;
  const total = parsed.year * 12 + parsed.month0 + Math.trunc(delta);
  if (total < 0) return null;
  const y = Math.floor(total / 12);
  const m0 = total - y * 12;
  return `${String(y).padStart(4, '0')}-${String(m0 + 1).padStart(2, '0')}`;
};

/** Lay a month out as a flat, Monday-first grid: leading/trailing `null` pads
 *  to whole weeks, ISO dates for the month's days. Length is a multiple of 7;
 *  render 7 per row. Null (not []) on a malformed key. */
export const monthGrid = (month: string): (string | null)[] | null => {
  const parsed = parseMonthKey(month);
  if (parsed === null) return null;
  const { year, month0 } = parsed;
  const first = new Date(Date.UTC(year, month0, 1));
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

/** Merge every DATED published plan into one date → meals map (undated plans
 *  have no calendar position and are skipped). Overlapping plans stack on the
 *  same day; an exact duplicate (same recipe uri + category on the same date,
 *  e.g. from two overlapping published copies) collapses to one entry — it
 *  would render as an identical link. Meals on each day keep placement order. */
export const mealsByDate = (plans: LocalPlan[]): Map<string, LocalMeal[]> => {
  const out = new Map<string, LocalMeal[]>();
  const seen = new Set<string>(); // `${date}|${category}|${uri}`
  for (const plan of plans) {
    const start = plan.startDate;
    if (start === undefined) continue;
    let rowIndex = 0; // position in the flat calendar → the date offset (7 days each)
    for (const cw of expandCalendar(plan.weeks)) {
      const src = plan.weeks[cw.week - 1];
      if (src === undefined) {
        rowIndex += 1;
        continue;
      }
      src.days.forEach((slot, di) => {
        if (slot.meals.length === 0) return;
        const iso = dateForSlot(start, rowIndex, di);
        if (iso === null) return;
        for (const meal of slot.meals) {
          const key = `${iso}|${meal.category ?? ''}|${meal.recipe.uri}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const list = out.get(iso);
          if (list === undefined) out.set(iso, [meal]);
          else list.push(meal);
        }
      });
      rowIndex += 1;
    }
  }
  return out;
};

/** Which month the calendar opens on: today's month when it holds any planned
 *  day (or when nothing is planned at all); otherwise the month of the nearest
 *  planned date — the next upcoming one, else the most recent past one — so
 *  the calendar never opens blank while plans exist. Null only when `todayIso`
 *  is malformed. */
export const defaultMonth = (todayIso: string, filledDates: Iterable<string>): string | null => {
  const thisMonth = monthOfDate(todayIso);
  if (thisMonth === null) return null;
  const dates = [...filledDates].filter((d) => monthOfDate(d) !== null).sort();
  if (dates.length === 0) return thisMonth;
  if (dates.some((d) => d.startsWith(`${thisMonth}-`))) return thisMonth;
  const upcoming = dates.find((d) => d >= todayIso);
  const nearest = upcoming ?? dates[dates.length - 1];
  return nearest === undefined ? thisMonth : monthOfDate(nearest);
};
