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
});
