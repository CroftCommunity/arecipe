// Feature A (timers) — the pure core (A-D3). No ambient clock, no setInterval:
// `now` is always injected and every remaining-time value is DERIVED from the
// absolute `endsAt` (A1). Nothing here ever persists or reads a decrementing
// "remaining" counter — a timer that ran while the device slept is simply
// already expired when read, which falls out of the data model for free.

/** A-D2. `durationMs` exists ONLY so a finished timer can be restarted; nothing
 *  computes a countdown from it. Remaining time always derives from `endsAt`. */
export interface Timer {
  id: string;
  label: string; // user text, may be empty
  endsAt: number; // epoch ms — the single source of truth for remaining time
  durationMs: number; // for restart, never for countdown math
  createdAt: number; // epoch ms
}

/** Milliseconds left until `endsAt`, clamped at 0 (never negative). */
export const remainingMs = (timer: Timer, now: number): number => Math.max(0, timer.endsAt - now);

/** A timer is expired the instant `now` reaches `endsAt` (not a tick later). */
export const isExpired = (timer: Timer, now: number): boolean => now >= timer.endsAt;

/** Build a timer from a label + duration, anchoring `endsAt` to the injected
 *  `now`. The id is a fresh UUID unless one is supplied (tests inject stable
 *  ids). This is the only place `endsAt` is computed from a duration. */
export const createTimer = (opts: {
  label: string;
  durationMs: number;
  now: number;
  id?: string;
}): Timer => ({
  id: opts.id ?? crypto.randomUUID(),
  label: opts.label,
  endsAt: opts.now + opts.durationMs,
  durationMs: opts.durationMs,
  createdAt: opts.now,
});

/** Re-anchor a finished (or running) timer to `now + durationMs`. `durationMs`
 *  is preserved so it can be restarted again. Pure — returns a new Timer. */
export const restartTimer = (timer: Timer, now: number): Timer => ({
  ...timer,
  endsAt: now + timer.durationMs,
});

/** Human-readable remaining time: `M:SS`, or `H:MM:SS` past an hour. Rounds up
 *  so a timer reads `10:00` at the instant it starts and only hits `0:00` at
 *  expiry. Pure — takes already-computed remaining ms. */
export const formatRemaining = (ms: number): string => {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/** Append without mutating the input array. */
export const addTimer = (timers: Timer[], timer: Timer): Timer[] => [...timers, timer];

/** Drop by id without mutating the input array. */
export const removeTimer = (timers: Timer[], id: string): Timer[] => timers.filter((t) => t.id !== id);
