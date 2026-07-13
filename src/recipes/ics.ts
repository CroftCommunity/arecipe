// iCalendar (RFC 5545) serialization for meal-plan calendars. PURE: no DOM, no
// network, and no clock — the DTSTAMP is injected by the caller (mirrors the
// clock-free discipline of meal-plan-dates.ts). One VCALENDAR aggregates the
// account's published plans; each plan's `startDate` (the "starting Monday"
// picker) anchors its slots via the SAME dateForSlot mapping the app calendar
// uses (buildCalendarRows), so a subscriber's calendar lands on the same real
// dates the app shows. Undated plans produce no events (they have no real
// dates). See plans/2026-07-13-1-plan-calendar-ics-publish-to-pages.md.

import { addDays, dateForSlot } from './meal-plan-dates.js';
import type { LocalPlan } from './meal-plan-local.js';
import { expandCalendar } from './meal-plan.js';

/** The production origin whose recipe pages the calendar links to. */
const APP_ORIGIN = 'https://arecipe.app';
/** UID namespace so events are globally unique + stable across regenerations. */
const UID_DOMAIN = 'arecipe.app';

export type CalendarEvent = {
  /** Stable, unique per (plan, date) — subscribers UPDATE rather than duplicate. */
  uid: string;
  /** All-day event date, ISO `YYYY-MM-DD` (floating, no timezone). */
  date: string;
  summary: string;
  recipeUri?: string;
};

/** The dated events for one plan: each filled day slot becomes one all-day
 * event. Undated plans (no `startDate`) or an unparseable anchor yield `[]`.
 * Mirrors `buildCalendarRows` exactly — a CUMULATIVE row index (7 days per
 * expanded row, repeats laid out consecutively) drives `dateForSlot`, and the
 * source days are read from `plan.weeks[cw.week-1]` so the cached recipe name is
 * available. */
export const planEvents = (plan: LocalPlan): CalendarEvent[] => {
  const start = plan.startDate;
  if (start === undefined) return [];
  const events: CalendarEvent[] = [];
  let rowIndex = 0;
  for (const cw of expandCalendar(plan.weeks)) {
    const src = plan.weeks[cw.week - 1];
    if (src === undefined) {
      rowIndex += 1;
      continue;
    }
    src.days.forEach((slot, dayIndex) => {
      if (slot.recipe === undefined) return;
      const date = dateForSlot(start, rowIndex, dayIndex);
      if (date === null) return;
      events.push({
        uid: `${plan.id}-${date.replace(/-/g, '')}@${UID_DOMAIN}`,
        date,
        summary: slot.recipe.name,
        recipeUri: slot.recipe.uri,
      });
    });
    rowIndex += 1;
  }
  return events;
};

/** Escape a value for an iCalendar TEXT property (RFC 5545 §3.3.11). */
const escapeText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');

/** ISO `YYYY-MM-DD` → iCalendar DATE value `YYYYMMDD`. */
const toIcalDate = (isoDate: string): string => isoDate.replace(/-/g, '');

/** An ISO-8601 UTC instant (e.g. `2026-07-13T12:00:00.000Z`) → iCalendar
 * UTC DATE-TIME `YYYYMMDDT HHMMSSZ`. Throws on a non-UTC/malformed stamp so a
 * bad DTSTAMP fails loud rather than emitting an invalid calendar. */
export const toIcalStamp = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(iso);
  if (m === null) throw new Error(`ics: dtstamp must be an ISO UTC instant, got "${iso}"`);
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}Z`;
};

/** Fold a content line to ≤75 octets per RFC 5545 §3.1, splitting on UTF-8
 * boundaries (never mid-codepoint) and prefixing continuation lines with a
 * single space. */
const foldLine = (line: string): string => {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  // First physical line caps at 75 octets; continuations carry a leading space,
  // so their content caps at 74 to keep the physical line ≤75.
  let cap = 75;
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    if (curBytes + chBytes > cap) {
      out.push(cur);
      cur = '';
      curBytes = 0;
      cap = 74;
    }
    cur += ch;
    curBytes += chBytes;
  }
  out.push(cur);
  return out.join('\r\n ');
};

/** Serialize a set of published plans into one VCALENDAR (`text/calendar`).
 * All-day VEVENTs (DATE value; DTEND = next day, exclusive). Deterministic
 * order (date, then UID) → stable diffs and clean subscriber updates. An empty
 * set (or only undated plans) yields a valid empty VCALENDAR so republishing
 * after the last plan is deleted clears the calendar and still parses. */
export const buildMealPlanIcs = (
  plans: LocalPlan[],
  opts: { dtstamp: string; calName?: string },
): string => {
  const stamp = toIcalStamp(opts.dtstamp);
  const calName = opts.calName ?? 'arecipe meals';

  const events = plans
    .flatMap(planEvents)
    .sort((a, b) => (a.date === b.date ? (a.uid < b.uid ? -1 : 1) : a.date < b.date ? -1 : 1));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//arecipe//meal-plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];
  for (const ev of events) {
    const endIso = addDays(ev.date, 1);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcalDate(ev.date)}`,
      // A valid anchor guarantees addDays succeeds; fall back to start date.
      `DTEND;VALUE=DATE:${toIcalDate(endIso ?? ev.date)}`,
      `SUMMARY:${escapeText(ev.summary)}`,
    );
    if (ev.recipeUri !== undefined) {
      lines.push(`DESCRIPTION:${escapeText(`${APP_ORIGIN}/recipe.html?u=${ev.recipeUri}`)}`);
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
};
