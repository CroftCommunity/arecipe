// Real PDS client — zero-dep atproto XRPC over fetch. Used by the live
// `wbsync publish --publish` path. D15: fetch + clock are injectable (so the
// blob-upload + throttle behaviour is testable without network), and every
// request is routed through a shared RateLimiter (concurrency 1, spacing,
// 429/5xx retry) — the user's "throttle the PDS too" requirement.
//
// There is no atproto SDK here (zero runtime deps), so this takes the sequential
// putRecord path — which also gives idempotent, resumable application (publish.ts).
import type { PdsClient } from './publish.ts';
import type { BlobRef, RecipeRecord } from './record.ts';
import { RateLimiter } from '../http/rate-limiter.ts';
import { realClock, type Clock } from '../util/clock.ts';

type Session = { did: string; accessJwt: string };

/** Minimal response surface used here — the real fetch Response satisfies it. */
type PdsResponse = {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
};
export type PdsFetch = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array },
) => Promise<PdsResponse>;

export type PdsDeps = { fetch?: PdsFetch; clock?: Clock; limiter?: RateLimiter };

const realFetch: PdsFetch = (url, init) => fetch(url, init as RequestInit) as unknown as Promise<PdsResponse>;

/** Surface limiter backoffs so a long rate-limit sleep is visible, not a hang. */
const waitLog = (i: { reason: string; ms: number; attempt: number }): void => {
  process.stderr.write(`  ↳ PDS ${i.reason} — waiting ${Math.round(i.ms / 1000)}s (attempt ${i.attempt + 1})\n`);
};
const defaultLimiter = (clock: Clock): RateLimiter => new RateLimiter(clock, { onWait: waitLog });

export class HttpPdsClient implements PdsClient {
  private readonly service: string;
  private readonly session: Session;
  private readonly fetch: PdsFetch;
  private readonly limiter: RateLimiter;

  constructor(service: string, session: Session, deps: PdsDeps = {}) {
    this.service = service;
    this.session = session;
    this.fetch = deps.fetch ?? realFetch;
    this.limiter = deps.limiter ?? defaultLimiter(deps.clock ?? realClock);
  }

  static async connect(service: string, identifier: string, password: string, deps: PdsDeps = {}): Promise<HttpPdsClient> {
    const fetchFn = deps.fetch ?? realFetch;
    const limiter = deps.limiter ?? defaultLimiter(deps.clock ?? realClock);
    const res = await limiter.run(() =>
      fetchFn(`${service}/xrpc/com.atproto.server.createSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      }),
    );
    if (res.status >= 400) throw new Error(`createSession failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const out = (await res.json()) as Session;
    return new HttpPdsClient(service, { did: out.did, accessJwt: out.accessJwt }, { fetch: fetchFn, limiter });
  }

  get did(): string {
    return this.session.did;
  }

  private async post(method: string, body: unknown): Promise<unknown> {
    const res = await this.limiter.run(() =>
      this.fetch(`${this.service}/xrpc/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.session.accessJwt}` },
        body: JSON.stringify(body),
      }),
    );
    if (res.status >= 400) throw new Error(`XRPC ${method} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }

  async putRecord(repo: string, collection: string, rkey: string, value: RecipeRecord): Promise<{ cid: string; uri: string }> {
    const out = (await this.post('com.atproto.repo.putRecord', { repo, collection, rkey, record: value })) as {
      cid: string;
      uri: string;
    };
    return { cid: out.cid, uri: out.uri };
  }

  async deleteRecord(repo: string, collection: string, rkey: string): Promise<void> {
    await this.post('com.atproto.repo.deleteRecord', { repo, collection, rkey });
  }

  /** Upload raw image bytes to the repo, returning the blob ref to embed. */
  async uploadBlob(bytes: Uint8Array, mimeType: string): Promise<BlobRef> {
    const res = await this.limiter.run(() =>
      this.fetch(`${this.service}/xrpc/com.atproto.repo.uploadBlob`, {
        method: 'POST',
        headers: { 'Content-Type': mimeType, Authorization: `Bearer ${this.session.accessJwt}` },
        body: bytes,
      }),
    );
    if (res.status >= 400) throw new Error(`uploadBlob failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const out = (await res.json()) as { blob: BlobRef };
    return out.blob;
  }

  async currentRev(repo: string): Promise<string> {
    // getLatestCommit's `did` parameter accepts a DID only — callers pass the
    // configured publish HANDLE, which returns HTTP 400. Fall back to the
    // authenticated session's DID, which is the repo we just wrote to.
    const did = repo.startsWith('did:') ? repo : this.session.did;
    const res = await this.limiter.run(() =>
      this.fetch(`${this.service}/xrpc/com.atproto.sync.getLatestCommit?${new URLSearchParams({ did }).toString()}`, {
        headers: { Authorization: `Bearer ${this.session.accessJwt}` },
      }),
    );
    if (res.status >= 400) throw new Error(`getLatestCommit failed: HTTP ${res.status}`);
    return ((await res.json()) as { rev: string }).rev;
  }
}
