// D1 — the wiki etiquette layer. Every wiki request in the tool goes through
// here. It enforces, against an injected fetch + injected clock so it is fully
// testable with no network:
//   • User-Agent with a contactable string (config refuses to build without it)
//   • Accept-Encoding: gzip
//   • format=json & formatversion=2 & maxlag=5 on every request
//   • total concurrency 1 with a >=1s gap between request starts
//   • Retry-After honoured on HTTP 429
//   • exponential backoff + retry on maxlag errors
//   • a >=15 minute pause on 5xx before retrying
import type { Clock } from '../util/clock.ts';
import { userAgent, type Config } from '../config.ts';

/** Minimal response surface the transport needs — satisfied by the real fetch
 *  Response and by test fakes alike. */
export type FetchResponse = {
  status: number;
  headers: { get(name: string): string | null | undefined };
  text(): Promise<string>;
};

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<FetchResponse>;

export const MIN_GAP_MS = 1000;
export const FIVE_XX_PAUSE_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 5 * 60 * 1000;

const getHeader = (h: FetchResponse['headers'], name: string): string | null => {
  const v = h.get(name) ?? h.get(name.toLowerCase());
  return v ?? null;
};

const retryAfterMs = (h: FetchResponse['headers']): number | null => {
  const raw = getHeader(h, 'Retry-After');
  if (raw === null) return null;
  const secs = Number(raw);
  return Number.isFinite(secs) ? secs * 1000 : null;
};

/** Count of wiki requests actually issued — surfaced in the run summary. */
export class WikiTransport {
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart = Number.NEGATIVE_INFINITY;
  requestCount = 0;
  private readonly cfg: Config;
  private readonly fetch: FetchLike;
  private readonly clock: Clock;

  constructor(cfg: Config, fetch: FetchLike, clock: Clock) {
    this.cfg = cfg;
    this.fetch = fetch;
    this.clock = clock;
  }

  /** Issue an Action API GET, returning the parsed JSON body. Serialized,
   *  rate-limited, and retried per the etiquette rules above. */
  async get(params: Record<string, string>): Promise<unknown> {
    return this.withLock(() => this.getWithRetry(params));
  }

  /** Public so callers can record the exact request URL as provenance (D4/D9). */
  buildUrl(params: Record<string, string>): string {
    const search = new URLSearchParams(params);
    // Etiquette params are forced — they are never the caller's to override.
    search.set('format', 'json');
    search.set('formatversion', '2');
    search.set('maxlag', '5');
    return `${this.cfg.wikiApiBase}?${search.toString()}`;
  }

  private async waitForGap(): Promise<void> {
    const since = this.clock.now() - this.lastStart;
    if (since < MIN_GAP_MS) await this.clock.sleep(MIN_GAP_MS - since);
    this.lastStart = this.clock.now();
  }

  private async getWithRetry(params: Record<string, string>): Promise<unknown> {
    const url = this.buildUrl(params);
    const headers = {
      'User-Agent': userAgent(this.cfg),
      'Accept-Encoding': 'gzip',
    };
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await this.waitForGap();
      this.requestCount++;
      const res = await this.fetch(url, { headers });
      const bodyText = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(bodyText);
      } catch {
        body = undefined;
      }
      const maxlag = isMaxlag(body);
      const backoff = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);

      if (res.status === 429) {
        await this.clock.sleep(retryAfterMs(res.headers) ?? backoff);
        continue;
      }
      if (maxlag) {
        await this.clock.sleep(retryAfterMs(res.headers) ?? backoff);
        continue;
      }
      if (res.status >= 500) {
        // Robot policy: back off hard on server errors.
        await this.clock.sleep(FIVE_XX_PAUSE_MS);
        continue;
      }
      if (res.status >= 400) {
        throw new WikiHttpError(res.status, bodyText.slice(0, 500));
      }
      if (body === undefined) {
        throw new Error(`wiki response was not JSON (status ${res.status}): ${bodyText.slice(0, 200)}`);
      }
      return body;
    }
    throw new Error(`wiki request exhausted ${MAX_ATTEMPTS} attempts: ${url}`);
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

export class WikiHttpError extends Error {
  readonly status: number;
  readonly bodyExcerpt: string;
  constructor(status: number, bodyExcerpt: string) {
    super(`wiki HTTP ${status}: ${bodyExcerpt}`);
    this.name = 'WikiHttpError';
    this.status = status;
    this.bodyExcerpt = bodyExcerpt;
  }
}

const isMaxlag = (body: unknown): boolean => {
  if (body === null || typeof body !== 'object') return false;
  const err = (body as { error?: { code?: unknown } }).error;
  return err !== undefined && err !== null && err.code === 'maxlag';
};
