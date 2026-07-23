// RUN-LAST-PLANNED Phase 1 (RED): the bounded calendar feed. The .ics carries
// occurrences from 90 days before `now` through all future dates, so a
// subscribed feed does not grow without limit. The window helper is pure and
// takes `now` as an argument (EXP-ICS-WINDOW — the 90 is a named constant).
import { describe, expect, it } from 'vitest';
import { FEED_WINDOW_PAST_DAYS, withinFeedWindow } from '../../../src/recipes/ics.js';

const NOW = new Date('2026-07-23T12:00:00.000Z'); // nowIso = 2026-07-23

describe('withinFeedWindow', () => {
  it('is a named 90-day past window', () => {
    expect(FEED_WINDOW_PAST_DAYS).toBe(90);
  });

  it('includes an occurrence exactly 90 days before now, excludes 91', () => {
    // 2026-07-23 minus 90 days = 2026-04-24; minus 91 = 2026-04-23.
    expect(withinFeedWindow('2026-04-24', NOW)).toBe(true);
    expect(withinFeedWindow('2026-04-23', NOW)).toBe(false);
  });

  it('leaves future occurrences unbounded', () => {
    expect(withinFeedWindow('2026-07-23', NOW)).toBe(true); // today
    expect(withinFeedWindow('2030-01-01', NOW)).toBe(true);
  });

  it('is pure: the same (date, now) always gives the same answer', () => {
    expect(withinFeedWindow('2026-04-24', NOW)).toBe(withinFeedWindow('2026-04-24', NOW));
  });
});
