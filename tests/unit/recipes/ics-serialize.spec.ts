// Phase 2 (ICS feed): the pure RFC 5545 serializer. One rule per test, red-first.
// No I/O. CRLF line endings, all-day VALUE=DATE events with a non-inclusive
// DTEND, TEXT escaping, 75-octet folding that never splits a UTF-8 sequence, and
// optional weekly RRULE.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { serializeCalendar, type IcsEvent } from '../../../src/recipes/ics-serialize.js';

const PRODID = '-//arecipe//meal-plan feed//EN';
const ev = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: 'uid-1',
  dtstamp: '2026-07-10T00:00:00.000Z',
  date: '2026-07-13',
  summary: 'Lasagna',
  ...over,
});
const lines = (s: string): string[] => s.split('\r\n');
/** UTF-8 octet length of a single physical (already-folded) line. */
const octets = (s: string): number => new TextEncoder().encode(s).length;

describe('serializeCalendar — wrapper', () => {
  it('emits the VCALENDAR envelope with VERSION, PRODID and METHOD:PUBLISH', () => {
    const out = serializeCalendar([], { prodId: PRODID });
    const ls = lines(out);
    expect(ls[0]).toBe('BEGIN:VCALENDAR');
    expect(ls).toContain('VERSION:2.0');
    expect(ls).toContain(`PRODID:${PRODID}`);
    expect(ls).toContain('METHOD:PUBLISH');
    // END:VCALENDAR is the last content line (a terminating CRLF follows).
    expect(ls[ls.length - 2]).toBe('END:VCALENDAR');
  });
});

describe('serializeCalendar — all-day event', () => {
  it('DTSTART is VALUE=DATE and DTEND is the NEXT day (non-inclusive)', () => {
    const ls = lines(serializeCalendar([ev()], { prodId: PRODID }));
    expect(ls).toContain('DTSTART;VALUE=DATE:20260713');
    expect(ls).toContain('DTEND;VALUE=DATE:20260714');
  });

  it('rolls the non-inclusive DTEND across a Dec 31 / year boundary', () => {
    const ls = lines(serializeCalendar([ev({ date: '2026-12-31' })], { prodId: PRODID }));
    expect(ls).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ls).toContain('DTEND;VALUE=DATE:20270101');
  });

  it('every VEVENT carries UID, DTSTAMP and DTSTART', () => {
    const ls = lines(serializeCalendar([ev()], { prodId: PRODID }));
    expect(ls).toContain('UID:uid-1');
    expect(ls).toContain('DTSTAMP:20260710T000000Z'); // ISO → iCal UTC basic
    expect(ls.some((l) => l.startsWith('DTSTART;VALUE=DATE:'))).toBe(true);
    expect(ls).toContain('BEGIN:VEVENT');
    expect(ls).toContain('END:VEVENT');
  });
});

describe('serializeCalendar — TEXT escaping', () => {
  it('escapes backslash, semicolon, comma and newline; leaves colon alone', () => {
    const ls = lines(
      serializeCalendar(
        [ev({ summary: 'Mac; cheese, and\\or a colon: bit', description: 'line1\nline2' })],
        { prodId: PRODID },
      ),
    );
    expect(ls).toContain('SUMMARY:Mac\\; cheese\\, and\\\\or a colon: bit');
    expect(ls).toContain('DESCRIPTION:line1\\nline2');
  });
});

describe('serializeCalendar — folding', () => {
  it('folds a long line at 75 octets with a leading space, no line over 75 octets', () => {
    const long = 'x'.repeat(200);
    const ls = lines(serializeCalendar([ev({ summary: long })], { prodId: PRODID }));
    // The SUMMARY spills across continuation lines that start with a space.
    const start = ls.findIndex((l) => l.startsWith('SUMMARY:'));
    expect(start).toBeGreaterThan(-1);
    expect(ls[start + 1]?.startsWith(' ')).toBe(true);
    for (const l of ls) expect(octets(l)).toBeLessThanOrEqual(75);
  });

  it('never splits a multi-byte UTF-8 character (accents + emoji)', () => {
    // Padding pushes the multibyte chars near a fold boundary.
    const summary = `${'a'.repeat(70)}café🍝🍕${'b'.repeat(70)}`;
    const out = serializeCalendar([ev({ summary })], { prodId: PRODID });
    for (const l of lines(out)) expect(octets(l)).toBeLessThanOrEqual(75);
    // Unfolding (strip CRLF + leading space of continuations) restores the exact
    // text, proving no code point was severed.
    const unfolded = out.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${summary}`);
  });
});

describe('serializeCalendar — line endings', () => {
  it('uses CRLF between every line and terminates with a trailing CRLF', () => {
    const out = serializeCalendar([ev()], { prodId: PRODID });
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(out.includes('\n')).toBe(true);
    // No bare LF (every \n is preceded by \r).
    expect(/[^\r]\n/.test(out)).toBe(false);
  });
});

describe('serializeCalendar — RRULE + expansion fallback', () => {
  it('emits RRULE:FREQ=WEEKLY;COUNT=n when an event carries a weekly recurrence', () => {
    const ls = lines(
      serializeCalendar([ev({ recurrence: { freq: 'WEEKLY', count: 3 } })], { prodId: PRODID }),
    );
    expect(ls).toContain('RRULE:FREQ=WEEKLY;COUNT=3');
    expect(ls.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1); // one recurring event
  });

  it('expansion mode: N discrete events (distinct UIDs), no RRULE', () => {
    const events = [
      ev({ uid: 'u#1', date: '2026-07-13' }),
      ev({ uid: 'u#2', date: '2026-07-20' }),
      ev({ uid: 'u#3', date: '2026-07-27' }),
    ];
    const ls = lines(serializeCalendar(events, { prodId: PRODID }));
    expect(ls.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(3);
    expect(ls.some((l) => l.startsWith('RRULE'))).toBe(false);
    expect(ls).toContain('UID:u#1');
    expect(ls).toContain('UID:u#3');
  });
});

describe('serializeCalendar — optional URL + DESCRIPTION', () => {
  it('emits URL raw (colons/slashes unescaped) and DESCRIPTION escaped', () => {
    const url = 'https://arecipe.app/recipe.html?u=at%3A%2F%2Fdid%2Fc%2Fr';
    const ls = lines(serializeCalendar([ev({ url, description: 'see: recipe' })], { prodId: PRODID }));
    expect(ls).toContain(`URL:${url}`);
    expect(ls).toContain('DESCRIPTION:see: recipe');
  });
});

describe('serializeCalendar — determinism', () => {
  it('identical input yields byte-identical output', () => {
    const events = [ev({ uid: 'a' }), ev({ uid: 'b', date: '2026-07-20' })];
    const a = serializeCalendar(events, { prodId: PRODID });
    const b = serializeCalendar(events, { prodId: PRODID });
    expect(a).toBe(b);
  });

  it('matches the hand-checked golden fixture', () => {
    const events: IcsEvent[] = [
      ev({ uid: 'plan1-w0-d0', summary: 'Lasagna', url: 'https://arecipe.app/recipe.html?u=at%3A%2F%2Fd%2Fc%2Fr' }),
      ev({ uid: 'plan1-w0-d2', date: '2026-07-15', summary: 'Café Salad 🥗', description: 'note: light' }),
    ];
    const golden = readFileSync(new URL('../../fixtures/ics/golden-basic.ics', import.meta.url), 'utf8');
    expect(serializeCalendar(events, { prodId: PRODID })).toBe(golden);
  });
});
