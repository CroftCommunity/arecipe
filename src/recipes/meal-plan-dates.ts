// Meal-plan date math (publish + share). A plan anchors on its first Monday's
// date (`startDate`, an ISO YYYY-MM-DD), and every day slot lays out from there,
// 7 days per week. Deliberately FLOATING — parsed and formatted in UTC with no
// timezone conversion — so a shared calendar reads identically in every
// timezone (a plan is a set of calendar dates, not instants). Pure; no clock.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse a strict `YYYY-MM-DD` string into a UTC Date, rejecting malformed or
 *  overflowing dates (e.g. `2026-02-30`). Returns null on any invalid input. */
const parseIsoDate = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Reject overflow: JS rolls 2026-02-30 into March, so round-trip the parts.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
};

const toIso = (date: Date): string => {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
};

/** The ISO date `days` days after `anchorIsoDate` (may be negative). Null if the
 *  anchor is unparseable. Rolls over month/year/leap boundaries. */
export const addDays = (anchorIsoDate: string, days: number): string | null => {
  const date = parseIsoDate(anchorIsoDate);
  if (date === null) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
};

/** The ISO date of a slot at (weekIndex, dayIndex), counting 7 days per week
 *  from the anchor (the first Monday). Null if the anchor is invalid. */
export const dateForSlot = (
  anchorIsoDate: string,
  weekIndex: number,
  dayIndex: number,
): string | null => addDays(anchorIsoDate, weekIndex * 7 + dayIndex);

/** A stable, locale-independent short label for an ISO date, e.g. "Jul 13".
 *  Null if the date is invalid. */
export const formatShortDate = (isoDate: string): string | null => {
  const date = parseIsoDate(isoDate);
  if (date === null) return null;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
};

/** A compact numeric "M/D" label for an ISO date (no zero padding), e.g.
 *  "8/10" — the grounded day-card stamp, where "Aug 10" would crowd a 7-column
 *  grid on a phone. Null if the date is invalid. */
export const formatDayMonth = (isoDate: string): string | null => {
  const date = parseIsoDate(isoDate);
  if (date === null) return null;
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
};

/** The Monday of the week CONTAINING `isoDate` (the date itself when it is a
 *  Monday; Sunday counts as the end of the week, so it snaps back six days).
 *  The planner's start picker normalizes any chosen date through this, keeping
 *  the plan anchored on a first Monday. Null if `isoDate` is unparseable. */
export const mondayOf = (isoDate: string): string | null => {
  const date = parseIsoDate(isoDate);
  if (date === null) return null;
  const day = date.getUTCDay(); // 0=Sun … 6=Sat
  const daysSinceMonday = (day + 6) % 7; // Mon=0 … Sun=6
  return addDays(isoDate, -daysSinceMonday);
};

/** The soonest Monday ON OR AFTER `todayIsoDate` (today itself if it is a
 *  Monday) as an ISO `YYYY-MM-DD`. The planner uses this to default the
 *  "starting Monday" picker so a fresh plan is dated (calendar-eligible) by
 *  default. Null if `todayIsoDate` is unparseable. Clock-free — the caller
 *  supplies `today`. */
export const nextMonday = (todayIsoDate: string): string | null => {
  const date = parseIsoDate(todayIsoDate);
  if (date === null) return null;
  const day = date.getUTCDay(); // 0=Sun … 6=Sat
  const daysUntilMonday = (1 - day + 7) % 7; // 0 when today is Monday
  return addDays(todayIsoDate, daysUntilMonday);
};

/** A human label for how long a plan spans: a real date range ("Jul 13 – Jul
 *  26") when anchored on a valid first-Monday, else a week count ("3 weeks").
 *  `weekCount` is the number of planned weeks (7 days each). */
export const weekRangeLabel = (startDate: string | undefined, weekCount: number): string => {
  if (startDate !== undefined) {
    const first = startDate;
    const lastIso = dateForSlot(startDate, weekCount - 1, 6);
    const start = formatShortDate(first);
    const end = lastIso !== null ? formatShortDate(lastIso) : null;
    if (start !== null && end !== null) return `${start} – ${end}`;
  }
  return `${weekCount} ${weekCount === 1 ? 'week' : 'weeks'}`;
};
