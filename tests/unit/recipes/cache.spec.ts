// Phase 4a: IndexedDB recipe cache with Tier 2 CID verification (D6).
// Behaviors (the verify fixture is a REAL record whose PDS-reported CID was
// reproduced by recompute in the D6 probe):
// - put() recomputes the CID from the record value; a genuine record is
//   stored with verified:true
// - a tampered value yields verified:false and a warn log (trust-surface
//   event — never silent)
// - get() round-trips by AT-URI; list() returns everything cached
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRecipeCache } from '../../../src/recipes/cache.js';
import { createLogger, type LogSink } from '../../../src/log.js';

const getRecordFixture = JSON.parse(
  readFileSync(
    new URL('../../fixtures/atproto/getRecord-exchange.recipe.recipe.json', import.meta.url),
    'utf8',
  ),
) as { uri: string; cid: string; value: Record<string, unknown> };

const makeSink = (): { sink: LogSink; lines: string[] } => {
  const lines: string[] = [];
  const grab =
    (method: string) =>
    (...args: unknown[]) => {
      lines.push(`${method}|${args.slice(0, 3).join(' ')}`);
    };
  return {
    lines,
    sink: { log: grab('log'), info: grab('info'), warn: grab('warn'), error: grab('error') },
  };
};

describe('createRecipeCache', () => {
  it('stores a genuine record as verified:true (CID recompute matches)', async () => {
    const cache = createRecipeCache({ dbName: `t1-${Math.random()}` });
    const entry = await cache.put(getRecordFixture);
    expect(entry.verified).toBe(true);
    expect(entry.cid).toBe(getRecordFixture.cid);
  });

  it('stores a tampered record as verified:false and warns', async () => {
    const { sink, lines } = makeSink();
    const cache = createRecipeCache({
      dbName: `t2-${Math.random()}`,
      logger: createLogger({ debug: false, sink }),
    });
    const tampered = {
      ...getRecordFixture,
      value: { ...getRecordFixture.value, name: 'Tampered Title' },
    };
    const entry = await cache.put(tampered);
    expect(entry.verified).toBe(false);
    expect(lines.some((l) => l.startsWith('warn|') && l.includes('cid'))).toBe(true);
  });

  it('get() round-trips by AT-URI and list() returns cached entries', async () => {
    const cache = createRecipeCache({ dbName: `t3-${Math.random()}` });
    await cache.put(getRecordFixture);
    const back = await cache.get(getRecordFixture.uri);
    expect(back?.value['name']).toBe(getRecordFixture.value['name']);
    expect(await cache.list()).toHaveLength(1);
  });

  // Phase 3 (2026-08-06 sharding plan): hydrating a cook must not cost one DB
  // connection per record. putMany writes a whole batch in ONE connection/
  // transaction while keeping the per-record verified flag honest.
  it('putMany() verifies each record and stores the whole batch', async () => {
    const cache = createRecipeCache({ dbName: `t4-${Math.random()}` });
    const second = {
      uri: getRecordFixture.uri.replace(/[^/]+$/, 'other-rkey'),
      cid: getRecordFixture.cid, // reported CID no longer matches the tampered value
      value: { ...getRecordFixture.value, name: 'Tampered Title' },
    };
    const entries = await cache.putMany([getRecordFixture, second]);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.verified).toBe(true);
    expect(entries[1]?.verified).toBe(false);
    // Both retrievable afterwards — the batch really was written.
    expect((await cache.get(getRecordFixture.uri))?.verified).toBe(true);
    expect((await cache.get(second.uri))?.verified).toBe(false);
    expect(await cache.list()).toHaveLength(2);
  });

  it('putMany() of an empty batch is a no-op that returns []', async () => {
    const cache = createRecipeCache({ dbName: `t5-${Math.random()}` });
    expect(await cache.putMany([])).toEqual([]);
    expect(await cache.list()).toHaveLength(0);
  });

  // Per-cook reads (hydration fast path): AT-URIs share the `at://<did>/`
  // prefix, so one key-range getAll serves a single cook without scanning the
  // whole store — a small cook must not wait on a corpus-sized getAll.
  it('listByUriPrefix() returns only the matching cook’s records', async () => {
    const cache = createRecipeCache({ dbName: `t6-${Math.random()}` });
    const other = {
      ...getRecordFixture,
      uri: getRecordFixture.uri.replace(/did:plc:[a-z0-9]+/, 'did:plc:zzzzzzzzzzzzzzzzzzzzzzzz'),
    };
    await cache.putMany([getRecordFixture, other]);
    const did = getRecordFixture.uri.split('/')[2]!;
    const mine = await cache.listByUriPrefix(`at://${did}/`);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.uri).toBe(getRecordFixture.uri);
    expect(await cache.listByUriPrefix('at://did:plc:absent/')).toEqual([]);
  });
});
