// Community ingredient aliases — PDS tier (plans/2026-09-14-plan-community-
// ingredient-aliases.md, Phase 9 of the ingredient-normalization plan). Public
// per-name app.arecipe.ingredientAlias records { name, key, createdAt },
// mirroring the cookFollow tier: list = public listRecords on your own repo,
// publish = adopt-first createRecord, unpublish = deleteRecord by name, mirror
// down = reconciling upsert + prune into the device-local corrections store.
import type { Agent } from '@atproto/api';
import { describe, expect, it, vi } from 'vitest';
import {
  INGREDIENT_ALIAS_COLLECTION,
  listIngredientAliases,
  mirrorIngredientAliasesDown,
  publishIngredientAlias,
  unpublishIngredientAlias,
} from '../../../src/recipes/ingredient-aliases-pds.js';
import { createIngredientCorrections } from '../../../src/recipes/ingredient-aliases-local.js';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const store = new Map<string, string>();
  return { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) };
};
const PDS = 'https://pds.test';
const DID = 'did:plc:me';
const listBody = (records: { rkey: string; name: string; key: string }[]): string =>
  JSON.stringify({
    records: records.map((r) => ({
      uri: `at://${DID}/${INGREDIENT_ALIAS_COLLECTION}/${r.rkey}`,
      cid: 'bafyfake',
      value: { $type: INGREDIENT_ALIAS_COLLECTION, name: r.name, key: r.key, createdAt: '2026-09-14T00:00:00.000Z' },
    })),
  });
const fetchReturning = (body: string, status = 200): typeof fetch =>
  (async () => ({ ok: status === 200, status, json: async () => JSON.parse(body) })) as unknown as typeof fetch;
const fakeAgent = () => {
  const createRecord = vi.fn(async () => ({ data: { uri: `at://${DID}/${INGREDIENT_ALIAS_COLLECTION}/newrkey`, cid: 'bafynew' } }));
  const deleteRecord = vi.fn(async () => ({}));
  const agent = { did: DID, com: { atproto: { repo: { createRecord, deleteRecord } } } } as unknown as Agent;
  return { agent, createRecord, deleteRecord };
};

describe('listIngredientAliases', () => {
  it('parses listRecords into { rkey, name, key, uri }, skipping malformed records', async () => {
    const body = JSON.parse(listBody([{ rkey: 'r1', name: 'freeze-dried strawberry', key: 'strawberry' }]));
    body.records.push({ uri: `at://${DID}/${INGREDIENT_ALIAS_COLLECTION}/bad`, value: { name: 42 } });
    const out = await listIngredientAliases({ pds: PDS, did: DID }, { fetchFn: fetchReturning(JSON.stringify(body)) });
    expect(out).toEqual([{ rkey: 'r1', name: 'freeze-dried strawberry', key: 'strawberry', uri: `at://${DID}/${INGREDIENT_ALIAS_COLLECTION}/r1` }]);
  });

  it('throws on a non-200 (never a silent empty list)', async () => {
    await expect(listIngredientAliases({ pds: PDS, did: DID }, { fetchFn: fetchReturning('{}', 500) })).rejects.toThrow(/HTTP 500/);
  });
});

describe('publishIngredientAlias — adopt-first', () => {
  it('creates { $type, name, key, createdAt } when the PDS has no record for the name, and stamps the local row', async () => {
    const { agent, createRecord } = fakeAgent();
    const local = createIngredientCorrections({ storage: memoryStorage(), now: () => 't' });
    local.confirm('freeze-dried strawberry', 'strawberry');
    const out = await publishIngredientAlias(agent, { name: 'freeze-dried strawberry', key: 'strawberry' }, local, { pds: PDS, did: DID }, { fetchFn: fetchReturning(listBody([])) });
    expect(out).toEqual({ rkey: 'newrkey', adopted: false });
    expect(createRecord).toHaveBeenCalledTimes(1);
    const arg = (createRecord.mock.calls as unknown as [[{ collection: string; record: Record<string, unknown> }]])[0][0];
    expect(arg.collection).toBe(INGREDIENT_ALIAS_COLLECTION);
    expect(arg.record).toMatchObject({ $type: INGREDIENT_ALIAS_COLLECTION, name: 'freeze-dried strawberry', key: 'strawberry' });
    expect(typeof arg.record['createdAt']).toBe('string');
    expect(local.all()[0]?.publishedRkey).toBe('newrkey');
  });

  it('adopts an existing record for the name instead of duplicating it', async () => {
    const { agent, createRecord } = fakeAgent();
    const local = createIngredientCorrections({ storage: memoryStorage(), now: () => 't' });
    local.confirm('freeze-dried strawberry', 'strawberry');
    const out = await publishIngredientAlias(agent, { name: 'freeze-dried strawberry', key: 'strawberry' }, local, { pds: PDS, did: DID }, { fetchFn: fetchReturning(listBody([{ rkey: 'r9', name: 'freeze-dried strawberry', key: 'strawberry' }])) });
    expect(out).toEqual({ rkey: 'r9', adopted: true });
    expect(createRecord).not.toHaveBeenCalled();
    expect(local.all()[0]?.publishedRkey).toBe('r9');
  });
});

describe('unpublishIngredientAlias', () => {
  it('resolves the rkey by name and deletes it; a no-op when absent', async () => {
    const { agent, deleteRecord } = fakeAgent();
    await unpublishIngredientAlias(agent, 'freeze-dried strawberry', { pds: PDS, did: DID }, { fetchFn: fetchReturning(listBody([{ rkey: 'r1', name: 'freeze-dried strawberry', key: 'strawberry' }])) });
    expect(deleteRecord).toHaveBeenCalledWith({ repo: DID, collection: INGREDIENT_ALIAS_COLLECTION, rkey: 'r1' });
    await unpublishIngredientAlias(agent, 'nothing here', { pds: PDS, did: DID }, { fetchFn: fetchReturning(listBody([])) });
    expect(deleteRecord).toHaveBeenCalledTimes(1);
  });
});

describe('mirrorIngredientAliasesDown — reconciling', () => {
  it('upserts every PDS alias into the local store with its marker, prunes marked rows the PDS lost, keeps local-only rows', async () => {
    const local = createIngredientCorrections({ storage: memoryStorage(), now: () => 't' });
    local.confirm('kombu broth', 'dashi'); // local-only: must survive
    local.confirm('old name', 'salt');
    local.markPublished('old name', 'gone'); // published once, deleted remotely since: must go
    await mirrorIngredientAliasesDown(local, { pds: PDS, did: DID }, { fetchFn: fetchReturning(listBody([{ rkey: 'r1', name: 'freeze-dried strawberry', key: 'strawberry' }])) });
    expect(local.lookup('freeze-dried strawberry')).toBe('strawberry');
    expect(local.all().find((e) => e.name === 'freeze-dried strawberry')?.publishedRkey).toBe('r1');
    expect(local.lookup('kombu broth')).toBe('dashi');
    expect(local.lookup('old name')).toBeUndefined();
  });
});
