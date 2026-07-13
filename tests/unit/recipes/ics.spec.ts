// ICS core (RFC 5545) for the subscribable meal-plan calendar. Pure, clock-free
// (DTSTAMP injected). Behaviors:
//  - planEvents maps filled slots → dated all-day events via the SAME cumulative
//    row-index math as buildCalendarRows (repeats consecutive, undated → [])
//  - buildMealPlanIcs serializes CRLF, folds ≤75 octets, escapes TEXT, emits
//    all-day DTSTART/DTEND (exclusive), stable UIDs, deterministic order
//  - empty / undated-only → a valid empty VCALENDAR (clears a subscription)
//  - unicode summaries survive
import { describe, expect, it } from 'vitest';
import { buildMealPlanIcs, planEvents, toIcalStamp } from '../../../src/recipes/ics.js';
import type { LocalPlan, LocalSlot, LocalWeek } from '../../../src/recipes/meal-plan-local.js';

const DTSTAMP = '2026-07-13T12:00:00.000Z';

const filled = (name: string, uri = 'at://did:plc:x/exchange.recipe.recipe/1'): LocalSlot => ({
  meals: [{ recipe: { uri, cid: 'bafyreiabc', name } }],
});
const emptyDays = (): LocalSlot[] => Array.from({ length: 7 }, () => ({ meals: [] }));
const week = (over: Partial<LocalWeek> = {}): LocalWeek => ({ repeat: 1, days: emptyDays(), ...over });
const plan = (over: Partial<LocalPlan> = {}): LocalPlan => ({
  id: 'p1',
  name: 'My plan',
  weeks: [week()],
  mealsPerDay: 3,
  updatedAt: '2026-07-13T00:00:00.000Z',
  ...over,
});

const physicalLines = (ics: string): string[] => ics.split('\r\n');
const octets = (s: string): number => new TextEncoder().encode(s).length;

describe('planEvents', () => {
  it('returns [] for an undated plan', () => {
    const days = emptyDays();
    days[0] = filled('Soup');
    expect(planEvents(plan({ weeks: [week({ days })] }))).toEqual([]);
  });

  it('maps a filled slot to a dated event at the anchor', () => {
    const days = emptyDays();
    days[0] = filled('Soup');
    const [ev, ...rest] = planEvents(plan({ startDate: '2026-07-13', weeks: [week({ days })] }));
    expect(rest).toEqual([]);
    expect(ev).toMatchObject({ date: '2026-07-13', summary: 'Soup', uid: 'p1-20260713@arecipe.app' });
  });

  it('lays repeated weeks out consecutively (7 days each)', () => {
    const days = emptyDays();
    days[0] = filled('Chili');
    const evs = planEvents(plan({ startDate: '2026-07-13', weeks: [week({ repeat: 2, days })] }));
    expect(evs.map((e) => e.date)).toEqual(['2026-07-13', '2026-07-20']);
  });

  it('dates each filled day within a week from the anchor', () => {
    const days = emptyDays();
    days[0] = filled('Mon');
    days[3] = filled('Thu');
    const evs = planEvents(plan({ startDate: '2026-07-13', weeks: [week({ days })] }));
    expect(evs.map((e) => [e.date, e.summary])).toEqual([
      ['2026-07-13', 'Mon'],
      ['2026-07-16', 'Thu'],
    ]);
  });

  it('folds a multi-meal day into ONE event, meal-typed summary + a link per meal', () => {
    const days = emptyDays();
    days[0] = {
      meals: [
        { recipe: { uri: 'at://d/c/oatmeal', cid: 'bafyo', name: 'Oatmeal' }, category: 'breakfast' },
        { recipe: { uri: 'at://d/c/lasagna', cid: 'bafyl', name: 'Lasagna' }, category: 'dinner' },
      ],
    };
    const evs = planEvents(plan({ startDate: '2026-07-13', weeks: [week({ days })] }));
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      date: '2026-07-13',
      uid: 'p1-20260713@arecipe.app',
      summary: 'Breakfast: Oatmeal, Dinner: Lasagna',
      recipeUris: ['at://d/c/oatmeal', 'at://d/c/lasagna'],
    });
  });
});

describe('buildMealPlanIcs', () => {
  const oneEvent = (): LocalPlan => {
    const days = emptyDays();
    days[0] = filled('Soup');
    return plan({ startDate: '2026-07-13', weeks: [week({ days })] });
  };

  it('wraps events in a VCALENDAR with the required properties', () => {
    const ics = buildMealPlanIcs([oneEvent()], { dtstamp: DTSTAMP });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//arecipe//meal-plan//EN');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('emits all-day DTSTART/DTEND (end exclusive = next day) and a stable UID', () => {
    const ics = buildMealPlanIcs([oneEvent()], { dtstamp: DTSTAMP });
    expect(ics).toContain('UID:p1-20260713@arecipe.app');
    expect(ics).toContain('DTSTAMP:20260713T120000Z');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260713');
    expect(ics).toContain('DTEND;VALUE=DATE:20260714');
    expect(ics).toContain('SUMMARY:Soup');
  });

  it('uses CRLF line endings everywhere', () => {
    const ics = buildMealPlanIcs([oneEvent()], { dtstamp: DTSTAMP });
    expect(ics.includes('\n')).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false); // every \n is preceded by \r
  });

  it('escapes TEXT special characters in SUMMARY', () => {
    const days = emptyDays();
    days[0] = filled('Beans, rice; peppers\\stew');
    const ics = buildMealPlanIcs([plan({ startDate: '2026-07-13', weeks: [week({ days })] })], {
      dtstamp: DTSTAMP,
    });
    expect(ics).toContain('SUMMARY:Beans\\, rice\\; peppers\\\\stew');
  });

  it('folds lines to <=75 octets, splitting with CRLF + space', () => {
    const days = emptyDays();
    days[0] = filled('X'.repeat(120));
    const ics = buildMealPlanIcs([plan({ startDate: '2026-07-13', weeks: [week({ days })] })], {
      dtstamp: DTSTAMP,
    });
    for (const line of physicalLines(ics)) expect(octets(line)).toBeLessThanOrEqual(75);
    expect(ics).toContain('\r\n '); // a continuation line exists
  });

  it('preserves unicode summaries', () => {
    const days = emptyDays();
    days[0] = filled('Crêpes brûlée 🍮');
    const ics = buildMealPlanIcs([plan({ startDate: '2026-07-13', weeks: [week({ days })] })], {
      dtstamp: DTSTAMP,
    });
    expect(ics).toContain('SUMMARY:Crêpes brûlée 🍮');
  });

  it('includes a recipe link in DESCRIPTION', () => {
    const ics = buildMealPlanIcs([oneEvent()], { dtstamp: DTSTAMP });
    expect(ics).toContain('DESCRIPTION:https://arecipe.app/recipe.html?u=at://did');
  });

  it('is a valid empty VCALENDAR for an empty set (no VEVENT)', () => {
    const ics = buildMealPlanIcs([], { dtstamp: DTSTAMP });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('treats undated-only plans as empty', () => {
    const days = emptyDays();
    days[0] = filled('Soup');
    const ics = buildMealPlanIcs([plan({ weeks: [week({ days })] })], { dtstamp: DTSTAMP });
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('aggregates multiple plans in deterministic date order', () => {
    const a = (): LocalPlan => {
      const days = emptyDays();
      days[0] = filled('Later');
      return plan({ id: 'pa', startDate: '2026-08-03', weeks: [week({ days })] });
    };
    const b = (): LocalPlan => {
      const days = emptyDays();
      days[0] = filled('Earlier');
      return plan({ id: 'pb', startDate: '2026-07-13', weeks: [week({ days })] });
    };
    const ics = buildMealPlanIcs([a(), b()], { dtstamp: DTSTAMP });
    expect(ics.indexOf('SUMMARY:Earlier')).toBeLessThan(ics.indexOf('SUMMARY:Later'));
  });
});

describe('toIcalStamp', () => {
  it('formats an ISO UTC instant', () => {
    expect(toIcalStamp('2026-07-13T12:00:00.000Z')).toBe('20260713T120000Z');
    expect(toIcalStamp('2026-07-13T12:00:00Z')).toBe('20260713T120000Z');
  });
  it('throws on a non-UTC or malformed stamp', () => {
    expect(() => toIcalStamp('2026-07-13')).toThrow();
    expect(() => toIcalStamp('2026-07-13T12:00:00+02:00')).toThrow();
  });
});
