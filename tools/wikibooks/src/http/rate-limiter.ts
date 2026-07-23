// D15 Phase 7 — reusable request limiter, ported from WikiTransport's etiquette
// core (src/http/transport.ts) so Commons fetches and PDS writes share one
// throttle instead of three ad-hoc ones. Concurrency 1 (single-tail promise),
// >=minGap spacing, Retry-After-honoring 429 retry, and a hard pause on 5xx.
// Fully injectable (Clock) — no real timers in tests. Generic over any response
// exposing `status` + `headers.get`.
import type { Clock } from '../util/clock.ts';

export type LimitedResponse = { status: number; headers: { get(name: string): string | null | undefined } };

export type RateLimitOpts = {
  minGapMs: number;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffCapMs: number;
  fiveXxPauseMs: number;
};

const DEFAULTS: RateLimitOpts = {
  minGapMs: 1000,
  maxAttempts: 10,
  backoffBaseMs: 1000,
  backoffCapMs: 5 * 60 * 1000,
  fiveXxPauseMs: 15 * 60 * 1000,
};

const retryAfterMs = (h: LimitedResponse['headers']): number | null => {
  const raw = h.get('Retry-After') ?? h.get('retry-after');
  if (raw === null || raw === undefined) return null;
  const secs = Number(raw);
  return Number.isFinite(secs) ? secs * 1000 : null;
};

export class RateLimiter {
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart = Number.NEGATIVE_INFINITY;
  /** Number of underlying fetches actually issued (retries included). */
  count = 0;
  private readonly clock: Clock;
  private readonly opts: RateLimitOpts;

  constructor(clock: Clock, opts: Partial<RateLimitOpts> = {}) {
    this.clock = clock;
    this.opts = { ...DEFAULTS, ...opts };
  }

  /** Run `doFetch` under the limiter: serialized, spaced, and retried on
   *  429 / 5xx. Returns the first response with status < 500 and != 429; the
   *  caller decides how to treat 4xx. Throws after maxAttempts. */
  async run<R extends LimitedResponse>(doFetch: () => Promise<R>): Promise<R> {
    return this.withLock(() => this.withRetry(doFetch));
  }

  private async waitForGap(): Promise<void> {
    const since = this.clock.now() - this.lastStart;
    if (since < this.opts.minGapMs) await this.clock.sleep(this.opts.minGapMs - since);
    this.lastStart = this.clock.now();
  }

  private async withRetry<R extends LimitedResponse>(doFetch: () => Promise<R>): Promise<R> {
    for (let attempt = 0; attempt < this.opts.maxAttempts; attempt++) {
      await this.waitForGap();
      this.count++;
      const r = await doFetch();
      const backoff = Math.min(this.opts.backoffCapMs, this.opts.backoffBaseMs * 2 ** attempt);
      if (r.status === 429) {
        await this.clock.sleep(retryAfterMs(r.headers) ?? backoff);
        continue;
      }
      if (r.status >= 500) {
        await this.clock.sleep(this.opts.fiveXxPauseMs);
        continue;
      }
      return r;
    }
    throw new Error(`request exhausted ${this.opts.maxAttempts} attempts`);
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
