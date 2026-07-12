// Phase 3 (ICS feed): the assembler — a user's meal-plan records → one
// continuous VCALENDAR. Pure: derive dates (shared with the app) then serialize.
// Hermetic, red-first.
import { describe, expect, it } from 'vitest';
import type { LocalPlan } from '../../../src/recipes/meal-plan-local.js';
import { buildCalendar } from '../../../src/recipes/ics-assemble.js';

const emptyDays = () => Array.from({ length: 7 }, () => ({}));

/** A one-week plan with a meal on Monday, anchored on a real first-Monday. */
const monPlan = (over: Partial<LocalPlan> = {}): LocalPlan => ({
  id: 'plan-1',
  name: 'Week',
  updatedAt: '2026-07-10T00:00:00.000Z',
  startDate: '2026-07-13',
  weeks: [
    {
      repeat: 1,
      days: [
        { recipe: { uri: 'at://did:plc:cook/exchange.recipe.recipe/lasagna', cid: 'bafyL', name: 'Lasagna' } },
        ...emptyDays().slice(1),
      ],
    },
  ],
  ...over,
});

// Unfold (RFC 5545 §3.1) before parsing so a long folded value (e.g. a recipe
// URL over 75 octets) reads as one logical line.
const unfold = (ics: string): string => ics.replace(/\r\n /g, '');
const vevents = (ics: string): string[] =>
  unfold(ics).split('BEGIN:VEVENT').slice(1).map((chunk) => chunk.split('END:VEVENT')[0] ?? '');
const line = (block: string, prop: string): string | undefined =>
  block.split('\r\n').find((l) => l.startsWith(prop));

describe('buildCalendar — meal selection', () => {
  it('emits one VEVENT for a meal-bearing day and skips empty slots', () => {
    const ics = buildCalendar([monPlan()]);
    expect(vevents(ics)).toHaveLength(1);
    expect(ics).toContain('SUMMARY:Lasagna');
  });

  it('skips a note-only day (no recipe, no name)', () => {
    const plan = monPlan();
    plan.weeks[0]!.days[1] = { note: 'leftovers' };
    const ics = buildCalendar([plan]);
    expect(vevents(ics)).toHaveLength(1); // still just Monday's Lasagna
  });

  it('skips an entire plan with no startDate anchor (cannot place on a calendar)', () => {
    const ics = buildCalendar([monPlan({ startDate: undefined })]);
    expect(vevents(ics)).toHaveLength(0);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
});

describe('buildCalendar — event content', () => {
  it('SUMMARY is the cached name; URL is the arecipe.app recipe page (encoded uri)', () => {
    const block = vevents(buildCalendar([monPlan()]))[0]!;
    expect(line(block, 'SUMMARY:')).toBe('SUMMARY:Lasagna');
    expect(line(block, 'URL:')).toBe(
      'URL:https://arecipe.app/recipe.html?u=at%3A%2F%2Fdid%3Aplc%3Acook%2Fexchange.recipe.recipe%2Flasagna',
    );
  });

  it('DTSTAMP comes from the record updatedAt (reproducible, not wall-clock)', () => {
    const block = vevents(buildCalendar([monPlan({ updatedAt: '2026-07-09T12:34:56.000Z' })]))[0]!;
    expect(line(block, 'DTSTAMP:')).toBe('DTSTAMP:20260709T123456Z');
  });

  it('carries a note into DESCRIPTION when the filled slot has one', () => {
    const plan = monPlan();
    plan.weeks[0]!.days[0] = {
      recipe: { uri: 'at://d/c/r', cid: 'bafy', name: 'Lasagna' },
      note: 'double batch',
    };
    const block = vevents(buildCalendar([plan]))[0]!;
    expect(line(block, 'DESCRIPTION:')).toBe('DESCRIPTION:double batch');
  });

  it('DTSTART is the derived date; the meal on Monday lands on 2026-07-13', () => {
    const block = vevents(buildCalendar([monPlan()]))[0]!;
    expect(line(block, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20260713');
  });
});

describe('buildCalendar — structural UIDs', () => {
  it('UID is structural (plan rkey + week/occurrence/day), stable across runs', () => {
    const a = buildCalendar([monPlan()]);
    const b = buildCalendar([monPlan()]);
    expect(a).toBe(b); // byte-identical
    expect(line(vevents(a)[0]!, 'UID:')).toBe('UID:plan-1-w1-r1-d0@arecipe.app');
  });

  it('a startDate shift keeps the SAME UID (an update, not an orphan+new)', () => {
    const before = vevents(buildCalendar([monPlan({ startDate: '2026-07-13' })]))[0]!;
    const after = vevents(buildCalendar([monPlan({ startDate: '2026-07-20' })]))[0]!;
    expect(line(before, 'UID:')).toBe(line(after, 'UID:'));
    // ...but the date moved.
    expect(line(before, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20260713');
    expect(line(after, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20260720');
  });

  it('a repeated week expands to distinct occurrence UIDs on consecutive weeks', () => {
    const plan = monPlan();
    plan.weeks[0]!.repeat = 3;
    const blocks = vevents(buildCalendar([plan]));
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => line(b, 'UID:'))).toEqual([
      'UID:plan-1-w1-r1-d0@arecipe.app',
      'UID:plan-1-w1-r2-d0@arecipe.app',
      'UID:plan-1-w1-r3-d0@arecipe.app',
    ]);
    expect(blocks.map((b) => line(b, 'DTSTART'))).toEqual([
      'DTSTART;VALUE=DATE:20260713',
      'DTSTART;VALUE=DATE:20260720',
      'DTSTART;VALUE=DATE:20260727',
    ]);
  });
});

describe('buildCalendar — aggregation', () => {
  it('aggregates multiple plans into one VCALENDAR in date order', () => {
    const july = monPlan({ id: 'plan-jul', startDate: '2026-07-13' });
    const june = monPlan({ id: 'plan-jun', startDate: '2026-06-01' });
    const ics = buildCalendar([july, june]); // pass out of order
    const starts = vevents(ics).map((b) => line(b, 'DTSTART'));
    expect(starts).toEqual(['DTSTART;VALUE=DATE:20260601', 'DTSTART;VALUE=DATE:20260713']);
    expect(ics.split('BEGIN:VCALENDAR')).toHaveLength(2); // exactly one calendar
  });

  it('de-duplicates identical structural events (same plan supplied twice)', () => {
    const p = monPlan();
    expect(vevents(buildCalendar([p, p]))).toHaveLength(1);
  });

  it('empty plan list yields a valid header/footer-only VCALENDAR', () => {
    const ics = buildCalendar([]);
    expect(vevents(ics)).toHaveLength(0);
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
  });
});
