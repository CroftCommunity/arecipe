// D1 — wiki etiquette, proven against a fake transport + fake clock. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WikiTransport, type FetchLike, type FetchResponse } from '../src/http/transport.ts';
import { FakeClock } from '../src/util/clock.ts';
import { loadConfig, MissingContactError, userAgent } from '../src/config.ts';

type Recorded = { url: string; headers: Record<string, string>; at: number };

/** A scripted fake transport: each call pops the next response from a queue,
 *  recording the request URL, headers, and the clock time it was issued. */
const makeFake = (
  responses: FetchResponse[],
  clock: FakeClock,
): { fetch: FetchLike; calls: Recorded[] } => {
  const calls: Recorded[] = [];
  const queue = [...responses];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, at: clock.now() });
    const next = queue.shift();
    if (next === undefined) throw new Error('fake transport ran out of scripted responses');
    return next;
  };
  return { fetch, calls };
};

const ok = (body: unknown): FetchResponse => ({
  status: 200,
  headers: new Map(),
  text: async () => JSON.stringify(body),
});

const withHeaders = (status: number, headers: Record<string, string>, body = '{}'): FetchResponse => ({
  status,
  headers: new Map(Object.entries(headers)),
  text: async () => body,
});

const cfg = () => loadConfig({ WIKIBOOKS_CONTACT: 'ops@arecipe.app' });

test('UA string has the mandated shape', () => {
  assert.equal(
    userAgent({ contact: 'ops@arecipe.app', version: '0.1.0' }),
    'arecipe-wikibooks-sync/0.1.0 (https://arecipe.app; ops@arecipe.app)',
  );
});

test('refuses to build config without a contact string', () => {
  assert.throws(() => loadConfig({}), MissingContactError);
  assert.throws(() => loadConfig({ WIKIBOOKS_CONTACT: '   ' }), MissingContactError);
});

test('every request carries UA, gzip, maxlag=5, formatversion=2', async () => {
  const clock = new FakeClock();
  const { fetch, calls } = makeFake([ok({ ok: true })], clock);
  const t = new WikiTransport(cfg(), fetch, clock);
  await t.get({ action: 'query', meta: 'siteinfo' });
  assert.equal(calls.length, 1);
  const c = calls[0]!;
  assert.equal(c.headers['User-Agent'], 'arecipe-wikibooks-sync/0.1.0 (https://arecipe.app; ops@arecipe.app)');
  assert.equal(c.headers['Accept-Encoding'], 'gzip');
  assert.match(c.url, /[?&]maxlag=5(&|$)/);
  assert.match(c.url, /[?&]format=json(&|$)/);
  assert.match(c.url, /[?&]formatversion=2(&|$)/);
  assert.match(c.url, /[?&]action=query(&|$)/);
});

test('concurrency 1 with a >=1s minimum gap between request starts', async () => {
  const clock = new FakeClock();
  const { fetch, calls } = makeFake([ok({}), ok({}), ok({})], clock);
  const t = new WikiTransport(cfg(), fetch, clock);
  // Fire three concurrently; the transport must serialize them.
  await Promise.all([t.get({ i: '1' }), t.get({ i: '2' }), t.get({ i: '3' })]);
  assert.equal(calls.length, 3);
  const gaps = [calls[1]!.at - calls[0]!.at, calls[2]!.at - calls[1]!.at];
  for (const g of gaps) assert.ok(g >= 1000, `gap ${g} must be >= 1000ms`);
});

test('honours Retry-After on HTTP 429 then retries', async () => {
  const clock = new FakeClock();
  const { fetch } = makeFake(
    [withHeaders(429, { 'Retry-After': '30' }), ok({ done: true })],
    clock,
  );
  const t = new WikiTransport(cfg(), fetch, clock);
  const body = (await t.get({ action: 'query' })) as { done: boolean };
  assert.deepEqual(body, { done: true });
  assert.ok(clock.sleeps.includes(30000), `expected a 30000ms sleep, got ${clock.sleeps.join(',')}`);
});

test('maxlag error backs off and retries', async () => {
  const clock = new FakeClock();
  const maxlagBody = JSON.stringify({ error: { code: 'maxlag', info: 'Waiting for a database server' } });
  const { fetch } = makeFake(
    [
      { status: 200, headers: new Map([['Retry-After', '5']]), text: async () => maxlagBody },
      ok({ done: true }),
    ],
    clock,
  );
  const t = new WikiTransport(cfg(), fetch, clock);
  const body = (await t.get({ action: 'query' })) as { done: boolean };
  assert.deepEqual(body, { done: true });
  assert.ok(clock.sleeps.some((s) => s >= 5000), `expected a maxlag backoff sleep, got ${clock.sleeps.join(',')}`);
});

test('pauses at least 15 minutes on a 5xx then retries', async () => {
  const clock = new FakeClock();
  const { fetch } = makeFake([withHeaders(503, {}, 'upstream boom'), ok({ done: true })], clock);
  const t = new WikiTransport(cfg(), fetch, clock);
  const body = (await t.get({ action: 'query' })) as { done: boolean };
  assert.deepEqual(body, { done: true });
  assert.ok(
    clock.sleeps.some((s) => s >= 15 * 60 * 1000),
    `expected a >=15min pause, got ${clock.sleeps.join(',')}`,
  );
});
