// Feature A (timers) — the pure core. The whole feature rests on storing an
// absolute `endsAt` timestamp and recomputing remaining time against an
// injected `now`, so a timer that "ran" while the device slept is simply
// already expired when read (no decrementing counter to drift). These tests
// pin that arithmetic and the immutability of the array helpers.
import { describe, expect, it } from 'vitest';
import {
  addTimer,
  createTimer,
  isExpired,
  remainingMs,
  removeTimer,
  restartTimer,
  type Timer,
} from '../../../src/timers/timer-state.js';

const at = (over: Partial<Timer> = {}): Timer => ({
  id: 'a',
  label: 'rice',
  endsAt: 1_000_000,
  durationMs: 600_000,
  createdAt: 400_000,
  ...over,
});

describe('remainingMs', () => {
  it('returns the difference when now is before endsAt', () => {
    expect(remainingMs(at({ endsAt: 1_000_000 }), 700_000)).toBe(300_000);
  });

  it('returns 0 (never negative) when now is past endsAt', () => {
    expect(remainingMs(at({ endsAt: 1_000_000 }), 1_500_000)).toBe(0);
  });
});

describe('isExpired', () => {
  it('is false at endsAt - 1 and true at exactly endsAt', () => {
    const t = at({ endsAt: 1_000_000 });
    expect(isExpired(t, 999_999)).toBe(false);
    expect(isExpired(t, 1_000_000)).toBe(true);
  });

  it('a timer read 8h after creation (device sleep) is expired with no drift', () => {
    // Created at T with a 10-minute duration; read 8 hours later. Because
    // remaining derives from the absolute endsAt, the elapsed wall-clock while
    // asleep is irrelevant: it is simply expired, remaining 0, exactly.
    const T = 1_000_000;
    const t = createTimer({ label: 'eggs', durationMs: 600_000, now: T });
    const eightHoursLater = T + 8 * 60 * 60 * 1000;
    expect(isExpired(t, eightHoursLater)).toBe(true);
    expect(remainingMs(t, eightHoursLater)).toBe(0);
    expect(t.endsAt).toBe(T + 600_000);
  });
});

describe('restartTimer', () => {
  it('sets endsAt to now + durationMs and leaves durationMs unchanged', () => {
    const t = at({ endsAt: 1_000_000, durationMs: 600_000 });
    const r = restartTimer(t, 5_000_000);
    expect(r.endsAt).toBe(5_600_000);
    expect(r.durationMs).toBe(600_000);
    expect(r.id).toBe(t.id);
  });
});

describe('addTimer / removeTimer immutability', () => {
  it('addTimer does not mutate its input array', () => {
    const base: Timer[] = [at({ id: 'x' })];
    const next = addTimer(base, at({ id: 'y' }));
    expect(base).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next).not.toBe(base);
  });

  it('removeTimer does not mutate its input array', () => {
    const base: Timer[] = [at({ id: 'x' }), at({ id: 'y' })];
    const next = removeTimer(base, 'x');
    expect(base).toHaveLength(2);
    expect(next.map((t) => t.id)).toEqual(['y']);
    expect(next).not.toBe(base);
  });
});

describe('concurrent timers compute independently', () => {
  it('each timer computes its own remaining from its own endsAt', () => {
    const now = 1_000_000;
    const a = at({ id: 'a', endsAt: now + 60_000 });
    const b = at({ id: 'b', endsAt: now + 5_000 });
    const c = at({ id: 'c', endsAt: now - 1 });
    expect(remainingMs(a, now)).toBe(60_000);
    expect(remainingMs(b, now)).toBe(5_000);
    expect(remainingMs(c, now)).toBe(0);
    expect(isExpired(c, now)).toBe(true);
    expect(isExpired(a, now)).toBe(false);
  });
});
