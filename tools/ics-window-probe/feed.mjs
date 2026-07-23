// EXP-ICS-WINDOW probe feed builder — a PURE function from an event list to
// RFC 5545 .ics text. Experiment tooling (tools/ is lint/typecheck-ignored,
// never ships to main), but real code with real tests: see feed.spec.mjs.
//
// Deliberately clock-free (DTSTAMP injected by the caller), mirroring the
// discipline of src/recipes/ics.ts, so a probe file is byte-reproducible. It is
// a stripped, self-contained cousin of the product builder: it does NOT know
// about meal plans — it takes explicit {uid,date,summary,sequence,status}
// events — precisely so the retained events (E2, E3) are trivially provable to
// be byte-identical between Feed A and Feed B. The ONLY thing that changes
// between the two feeds is E1.
//
// Event shape:
//   { uid: string, date: 'YYYY-MM-DD', summary: string,
//     sequence: number, status?: 'CANCELLED' }

/** Escape a value for an iCalendar TEXT property (RFC 5545 §3.3.11). */
const escapeText = (value) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');

/** ISO `YYYY-MM-DD` → iCalendar DATE value `YYYYMMDD`. Throws on malformed. */
const toIcalDate = (isoDate) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error(`ics: bad date "${isoDate}"`);
  return isoDate.replace(/-/g, '');
};

/** ISO `YYYY-MM-DD` → next day's `YYYYMMDD` (all-day DTEND is exclusive). */
const nextIcalDate = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10).replace(/-/g, '');
};

/** An ISO-8601 UTC instant → iCalendar UTC DATE-TIME. Throws on a non-UTC or
 * malformed stamp so a bad DTSTAMP fails loud rather than emitting garbage. */
export const toIcalStamp = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(iso);
  if (m === null) throw new Error(`ics: dtstamp must be an ISO UTC instant, got "${iso}"`);
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}Z`;
};

/** Fold a content line to ≤75 octets per RFC 5545 §3.1 (UTF-8 safe, leading
 * space on continuations). */
const foldLine = (line) => {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let curBytes = 0;
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

/** Retract an event the standards-blessed way: keep the same UID, bump SEQUENCE,
 * and mark STATUS:CANCELLED. Pure — returns a new event, never mutates. */
export const cancel = (ev) => ({ ...ev, sequence: ev.sequence + 1, status: 'CANCELLED' });

/** Serialize an event list into one VCALENDAR (`text/calendar`). Events are
 * emitted in the given order (the probe controls order explicitly). CRLF, folded
 * ≤75 octets, TEXT escaped. All-day VEVENTs (DATE value; DTEND exclusive). */
export const buildProbeIcs = (events, opts) => {
  const stamp = toIcalStamp(opts.dtstamp);
  const calName = opts.calName ?? 'EXP-ICS-WINDOW probe';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//arecipe//ics-window-probe//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcalDate(ev.date)}`,
      `DTEND;VALUE=DATE:${nextIcalDate(ev.date)}`,
      `SUMMARY:${escapeText(ev.summary)}`,
      `SEQUENCE:${ev.sequence}`,
    );
    if (ev.status !== undefined) lines.push(`STATUS:${ev.status}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
};
