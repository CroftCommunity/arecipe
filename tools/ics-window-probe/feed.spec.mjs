// Unit tests for the EXP-ICS-WINDOW probe feed builder (tools/ics-window-probe).
//
// This is EXPERIMENT tooling, not product code — it lives under tools/ (which is
// lint- and typecheck-ignored) and never merges to main. But section 5 of the
// experiment plan is explicit: the feed builder is real code and MUST be tested
// for UID stability, SEQUENCE increment, and STATUS:CANCELLED emission BEFORE it
// produces a single probe file. Run with:
//   npx vitest run tools/ics-window-probe/feed.spec.mjs
//
// The invariant that makes the whole probe valid: between Feed A and Feed B the
// retained events (E2, E3) must be BYTE-IDENTICAL — the only change is E1. If
// the builder ever perturbed a retained VEVENT, a subscriber could drop/replace
// it for reasons unrelated to E1's removal and the experiment would be junk.
import { describe, expect, it } from 'vitest';
import { buildProbeIcs, cancel, toIcalStamp } from './feed.mjs';

const DTSTAMP = '2026-07-23T12:00:00.000Z';

// The three canonical probe events (dates fixed from base 2026-07-23).
const E1 = { uid: 'exp-ics-window-e1@arecipe.app', date: '2026-05-24', summary: 'E1 sixty days past', sequence: 0 };
const E2 = { uid: 'exp-ics-window-e2@arecipe.app', date: '2026-06-23', summary: 'E2 thirty days past', sequence: 0 };
const E3 = { uid: 'exp-ics-window-e3@arecipe.app', date: '2026-07-30', summary: 'E3 seven days future', sequence: 0 };

// Extract the physical lines of a single VEVENT block by UID (for byte-identity
// comparison of a retained event across two feeds).
const veventBlock = (ics, uid) => {
  const lines = ics.split('\r\n');
  const out = [];
  let inside = false;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') { inside = true; out.length = 0; out.push(l); continue; }
    if (inside) {
      out.push(l);
      if (l.startsWith('UID:') && l !== `UID:${uid}`) inside = false; // wrong event, reset
      if (l === 'END:VEVENT' && inside) return out.join('\r\n');
    }
  }
  return null;
};

describe('toIcalStamp', () => {
  it('formats an ISO UTC instant', () => {
    expect(toIcalStamp('2026-07-23T12:00:00.000Z')).toBe('20260723T120000Z');
    expect(toIcalStamp('2026-07-23T12:00:00Z')).toBe('20260723T120000Z');
  });
  it('throws on a non-UTC or malformed stamp', () => {
    expect(() => toIcalStamp('2026-07-23')).toThrow();
    expect(() => toIcalStamp('2026-07-23T12:00:00+02:00')).toThrow();
  });
});

describe('buildProbeIcs — structure', () => {
  it('wraps events in a VCALENDAR with the required properties', () => {
    const ics = buildProbeIcs([E1, E2, E3], { dtstamp: DTSTAMP, calName: 'EXP arm 1' });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//arecipe//ics-window-probe//EN');
    expect(ics).toContain('CALSCALE:GREGORIAN');
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics).toContain('X-WR-CALNAME:EXP arm 1');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('emits all-day DTSTART/DTEND (end exclusive = next day)', () => {
    const ics = buildProbeIcs([E1], { dtstamp: DTSTAMP });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260524');
    expect(ics).toContain('DTEND;VALUE=DATE:20260525');
  });

  it('stamps every VEVENT with the injected DTSTAMP', () => {
    const ics = buildProbeIcs([E1, E2, E3], { dtstamp: DTSTAMP });
    expect(ics.match(/DTSTAMP:20260723T120000Z/g)).toHaveLength(3);
  });

  it('uses CRLF line endings everywhere', () => {
    const ics = buildProbeIcs([E1], { dtstamp: DTSTAMP });
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it('escapes TEXT special characters in SUMMARY', () => {
    const ics = buildProbeIcs([{ ...E1, summary: 'a, b; c\\d' }], { dtstamp: DTSTAMP });
    expect(ics).toContain('SUMMARY:a\\, b\\; c\\\\d');
  });
});

describe('buildProbeIcs — UID stability', () => {
  it('emits the UID verbatim', () => {
    const ics = buildProbeIcs([E1], { dtstamp: DTSTAMP });
    expect(ics).toContain('UID:exp-ics-window-e1@arecipe.app');
  });

  it('keeps a retained event BYTE-IDENTICAL between Feed A and Feed B (E1 removed)', () => {
    const feedA = buildProbeIcs([E1, E2, E3], { dtstamp: DTSTAMP });
    const feedB = buildProbeIcs([E2, E3], { dtstamp: DTSTAMP }); // omission arm
    for (const uid of [E2.uid, E3.uid]) {
      expect(veventBlock(feedB, uid)).toBe(veventBlock(feedA, uid));
    }
  });

  it('keeps a retained event BYTE-IDENTICAL between Feed A and the cancellation Feed B', () => {
    const feedA = buildProbeIcs([E1, E2, E3], { dtstamp: DTSTAMP });
    const feedB = buildProbeIcs([cancel(E1), E2, E3], { dtstamp: DTSTAMP }); // tombstone arm
    for (const uid of [E2.uid, E3.uid]) {
      expect(veventBlock(feedB, uid)).toBe(veventBlock(feedA, uid));
    }
  });
});

describe('buildProbeIcs — SEQUENCE', () => {
  it('emits SEQUENCE:0 for a base event', () => {
    const ics = buildProbeIcs([E1], { dtstamp: DTSTAMP });
    expect(ics).toContain('SEQUENCE:0');
  });

  it('cancel() increments SEQUENCE and preserves UID/date', () => {
    const c = cancel(E1);
    expect(c.sequence).toBe(1);
    expect(c.uid).toBe(E1.uid);
    expect(c.date).toBe(E1.date);
    const ics = buildProbeIcs([c], { dtstamp: DTSTAMP });
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).not.toContain('SEQUENCE:0');
  });
});

describe('buildProbeIcs — STATUS:CANCELLED', () => {
  it('does NOT emit STATUS for a normal event', () => {
    const ics = buildProbeIcs([E1], { dtstamp: DTSTAMP });
    expect(ics).not.toContain('STATUS:');
  });

  it('emits STATUS:CANCELLED for a cancelled event, retaining its VEVENT', () => {
    const ics = buildProbeIcs([cancel(E1)], { dtstamp: DTSTAMP });
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:exp-ics-window-e1@arecipe.app');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('SEQUENCE:1');
  });
});
