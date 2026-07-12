// Pure iCalendar (RFC 5545) serializer for the meal-plan feed. No I/O, no clock.
// The feed's structural correctness lives here: CRLF line endings, 75-octet
// folding that never severs a UTF-8 code point, TEXT-value escaping, all-day
// VALUE=DATE events with a NON-INCLUSIVE DTEND (the day AFTER the last day), and
// an optional weekly RRULE. Reproducible: identical input → byte-identical output
// (DTSTAMP is sourced from the caller, never wall-clock).
//
// Only the generator (Node) uses this; it is written environment-agnostically
// (TextEncoder, no Buffer) so it stays a plain pure module.

import { addDays } from './meal-plan-dates.js';

export type IcsEvent = {
  /** Globally-stable, structural UID (never derived from the date). */
  uid: string;
  /** Source datetime for DTSTAMP (ISO 8601 — e.g. the record's updatedAt). */
  dtstamp: string;
  /** All-day date, floating ISO YYYY-MM-DD. */
  date: string;
  summary: string;
  description?: string;
  /** A URI value (emitted raw — not TEXT-escaped). */
  url?: string;
  /** Optional weekly recurrence → `RRULE:FREQ=WEEKLY;COUNT=n`. */
  recurrence?: { freq: 'WEEKLY'; count: number };
};

export type SerializeOpts = {
  /** PRODID identifying the generating product. */
  prodId: string;
};

const CRLF = '\r\n';
const OCTET_LIMIT = 75;
const encoder = new TextEncoder();
const byteLen = (s: string): number => encoder.encode(s).length;

/** Escape a TEXT value per RFC 5545 §3.3.11: backslash first (so the escapes we
 * add aren't re-escaped), then `;` `,` and newline. A colon is NOT escaped. */
const escapeText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');

/** ISO datetime → iCalendar UTC "basic" form YYYYMMDDTHHMMSSZ. Parses a fixed
 * string (no wall-clock read) and normalizes any offset to UTC. */
const toIcsUtc = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid DTSTAMP datetime: ${iso}`);
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${String(d.getUTCFullYear()).padStart(4, '0')}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
};

/** ISO YYYY-MM-DD → iCalendar DATE value YYYYMMDD. */
const toIcsDate = (iso: string): string => iso.replace(/-/g, '');

/** Fold one logical line into physical lines each ≤75 octets (RFC 5545 §3.1).
 * Continuation lines begin with a single space (which counts toward the 75).
 * Splits only on code-point boundaries, so a multi-byte UTF-8 sequence is never
 * severed. Returns the physical lines (joined with CRLF by the caller). */
const foldLine = (line: string): string[] => {
  const out: string[] = [];
  let current = '';
  for (const ch of line) {
    // `ch` is a whole code point (for..of iterates code points, not UTF-16 units).
    if (byteLen(current) + byteLen(ch) > OCTET_LIMIT) {
      out.push(current);
      current = ` ${ch}`; // continuation: leading space + this code point
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
};

const eventLines = (event: IcsEvent): string[] => {
  const raw: string[] = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsUtc(event.dtstamp)}`,
    `DTSTART;VALUE=DATE:${toIcsDate(event.date)}`,
    `DTEND;VALUE=DATE:${toIcsDate(nextDay(event.date))}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.description !== undefined) raw.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.url !== undefined) raw.push(`URL:${event.url}`);
  if (event.recurrence !== undefined) {
    raw.push(`RRULE:FREQ=${event.recurrence.freq};COUNT=${event.recurrence.count}`);
  }
  raw.push('END:VEVENT');
  return raw.flatMap(foldLine);
};

/** The day after an ISO date (non-inclusive DTEND). Reuses the shared, tested
 * floating-date arithmetic so rollover (e.g. Dec 31 → Jan 1) matches the app. */
const nextDay = (iso: string): string => {
  const next = addDays(iso, 1);
  if (next === null) throw new Error(`invalid event date: ${iso}`);
  return next;
};

/** Serialize events into one RFC 5545 VCALENDAR string. Events are emitted in the
 * order given (the assembler is responsible for the stable date ordering). */
export const serializeCalendar = (events: readonly IcsEvent[], opts: SerializeOpts): string => {
  const body: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${opts.prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap(eventLines),
    'END:VCALENDAR',
  ];
  // Trailing CRLF: every content line — including the last — ends with CRLF.
  return body.join(CRLF) + CRLF;
};
