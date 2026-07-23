// D15 Phase 7 — reusable RateLimiter (ported from WikiTransport's etiquette
// core) + HttpPdsClient.uploadBlob. The limiter serializes to concurrency 1,
// spaces requests, and retries 429 (Retry-After/backoff) and 5xx (pause). Both
// PDS writes route through it. All tested with injected fetch + FakeClock — no
// network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../src/http/rate-limiter.ts';
import { HttpPdsClient } from '../src/publish/http-pds.ts';
import { FakeClock } from '../src/util/clock.ts';

const res = (status: number, headers: Record<string, string> = {}, json: unknown = {}) => ({
  status,
  headers: { get: (n: string) => headers[n] ?? headers[n.toLowerCase()] ?? null },
  json: async () => json,
  text: async () => JSON.stringify(json),
});

test('RateLimiter spaces successive calls by at least minGapMs', async () => {
  const clock = new FakeClock(0);
  const rl = new RateLimiter(clock, { minGapMs: 1000 });
  await rl.run(async () => res(200));
  await rl.run(async () => res(200));
  assert.ok(clock.sleeps.some((s) => s >= 1000), `expected a >=1000ms spacing sleep, got ${clock.sleeps}`);
});

test('RateLimiter retries 429 honoring Retry-After, then returns the success', async () => {
  const clock = new FakeClock(0);
  const rl = new RateLimiter(clock, { minGapMs: 0 });
  let calls = 0;
  const out = await rl.run(async () => {
    calls++;
    return calls === 1 ? res(429, { 'Retry-After': '2' }) : res(200);
  });
  assert.equal(calls, 2);
  assert.equal(out.status, 200);
  assert.ok(clock.sleeps.includes(2000), `expected a 2000ms Retry-After sleep, got ${clock.sleeps}`);
});

test('RateLimiter serializes (concurrency 1) — overlapping runs do not interleave', async () => {
  const clock = new FakeClock(0);
  const rl = new RateLimiter(clock, { minGapMs: 0 });
  const order: string[] = [];
  const a = rl.run(async () => { order.push('a-start'); await Promise.resolve(); order.push('a-end'); return res(200); });
  const b = rl.run(async () => { order.push('b-start'); return res(200); });
  await Promise.all([a, b]);
  assert.deepEqual(order, ['a-start', 'a-end', 'b-start']);
});

test('HttpPdsClient.uploadBlob posts raw bytes and returns the blob ref', async () => {
  const clock = new FakeClock(0);
  const seen: { url: string; init: { method?: string; headers?: Record<string, string>; body?: unknown } }[] = [];
  const fakeFetch = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown }) => {
    seen.push({ url, init });
    return res(200, {}, { blob: { $type: 'blob', ref: { $link: 'bafycid123' }, mimeType: 'image/jpeg', size: 42 } });
  };
  const pds = new HttpPdsClient('https://pds.example', { did: 'did:plc:x', accessJwt: 'jwt' }, { fetch: fakeFetch, clock });
  const blob = await pds.uploadBlob(new Uint8Array([1, 2, 3]), 'image/jpeg');
  assert.equal(blob.ref.$link, 'bafycid123');
  assert.equal(blob.mimeType, 'image/jpeg');
  const call = seen.find((s) => s.url.includes('uploadBlob'));
  assert.ok(call, 'called com.atproto.repo.uploadBlob');
  assert.equal(call.init.headers?.['Content-Type'], 'image/jpeg', 'raw content-type, not application/json');
  assert.match(call.init.headers?.Authorization ?? '', /^Bearer /);
});
