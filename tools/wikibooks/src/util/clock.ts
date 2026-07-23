// Injected time. Nothing in the tool reads the wall clock directly — the
// transform stage must be a pure function of its input bytes, and the etiquette
// layer's backoff/pause schedule must be testable without real waiting. Both
// take a Clock; production wires the real one, tests wire a fake.

export type Clock = {
  /** Milliseconds since the Unix epoch. */
  now(): number;
  /** Resolve after `ms` milliseconds. */
  sleep(ms: number): Promise<void>;
};

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * A controllable clock for tests. `now()` returns the accumulated virtual time;
 * `sleep()` advances it instantly (no real delay) and records the requested
 * durations so a test can assert the backoff/gap schedule.
 */
export class FakeClock implements Clock {
  private t: number;
  readonly sleeps: number[] = [];
  constructor(start = 0) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.t += ms;
  }
  /** Advance virtual time without recording a sleep (e.g. simulate work). */
  advance(ms: number): void {
    this.t += ms;
  }
}
