// Cook follows — PDS tier (D3). Public per-cook app.arecipe.cookFollow records,
// mirroring app.bsky.graph.follow: { subject, createdAt }. Hermetic — an injected
// fetchFn drives the public listRecords read (same path resolveCookbook uses for
// bsky follows); an injected Agent proves the create/delete call shapes.
// Behaviors:
//   - listCookFollows parses listRecords pages → { rkey, subject, uri }
//   - followCook createRecords { subject, createdAt }
//   - unfollowCook resolves the rkey by subject, then deleteRecords it
//   - mirrorCookFollowsDown writes PDS follows into the local store WITHOUT
//     erasing local-only rows (pending the D6 publish offer)
import type { Agent } from '@atproto/api';
import { describe, expect, it, vi } from 'vitest';
import {
  COOK_FOLLOW_COLLECTION,
  followCook,
  listCookFollows,
  mirrorCookFollowsDown,
  unfollowCook,
} from '../../../src/social/cook-follows-pds.js';
import { createCookFollowsLocal } from '../../../src/social/cook-follows-local.js';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
};

const PDS = 'https://pds.test';
const DID = 'did:plc:me';

const listBody = (records: { rkey: string; subject: string }[]): string =>
  JSON.stringify({
    records: records.map((r) => ({
      uri: `at://${DID}/${COOK_FOLLOW_COLLECTION}/${r.rkey}`,
      cid: 'bafyfake',
      value: { $type: COOK_FOLLOW_COLLECTION, subject: r.subject, createdAt: '2026-07-15T00:00:00.000Z' },
    })),
  });

const fetchReturning = (body: string, status = 200): typeof fetch =>
  (async () => ({ ok: status === 200, status, json: async () => JSON.parse(body) })) as unknown as typeof fetch;

describe('listCookFollows', () => {
  it('parses listRecords into { rkey, subject, uri }', async () => {
    const fetchFn = fetchReturning(
      listBody([
        { rkey: 'r1', subject: 'did:plc:alice' },
        { rkey: 'r2', subject: 'did:plc:bob' },
      ]),
    );
    const follows = await listCookFollows({ pds: PDS, did: DID }, { fetchFn });
    expect(follows).toEqual([
      { rkey: 'r1', subject: 'did:plc:alice', uri: `at://${DID}/${COOK_FOLLOW_COLLECTION}/r1` },
      { rkey: 'r2', subject: 'did:plc:bob', uri: `at://${DID}/${COOK_FOLLOW_COLLECTION}/r2` },
    ]);
  });

  it('reads the collection over the public PDS listRecords path', async () => {
    let url = '';
    const fetchFn = (async (u: string) => {
      url = u;
      return { ok: true, status: 200, json: async () => ({ records: [] }) };
    }) as unknown as typeof fetch;
    await listCookFollows({ pds: PDS, did: DID }, { fetchFn });
    expect(url).toContain('com.atproto.repo.listRecords');
    expect(url).toContain(`collection=${COOK_FOLLOW_COLLECTION}`);
    expect(url).toContain(encodeURIComponent(DID));
  });

  it('skips records missing a subject (open-world tolerance)', async () => {
    const fetchFn = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        records: [
          { uri: `at://${DID}/${COOK_FOLLOW_COLLECTION}/ok`, value: { subject: 'did:plc:alice', createdAt: 'x' } },
          { uri: `at://${DID}/${COOK_FOLLOW_COLLECTION}/bad`, value: { createdAt: 'x' } },
        ],
      }),
    })) as unknown as typeof fetch;
    const follows = await listCookFollows({ pds: PDS, did: DID }, { fetchFn });
    expect(follows.map((f) => f.subject)).toEqual(['did:plc:alice']);
  });

  it('throws on a non-ok list response', async () => {
    await expect(
      listCookFollows({ pds: PDS, did: DID }, { fetchFn: fetchReturning('{}', 500) }),
    ).rejects.toThrow();
  });
});

describe('followCook', () => {
  it('createRecords { subject, createdAt } in the cookFollow collection', async () => {
    const createRecord = vi.fn(
      async (_arg: { repo: string; collection: string; record: Record<string, unknown> }) => ({
        data: { uri: `at://${DID}/x/r1`, cid: 'bafy' },
      }),
    );
    const agent = { did: DID, com: { atproto: { repo: { createRecord } } } } as unknown as Agent;
    const res = await followCook(agent, 'did:plc:alice');
    expect(createRecord).toHaveBeenCalledTimes(1);
    const arg = createRecord.mock.calls[0]![0];
    expect(arg.repo).toBe(DID);
    expect(arg.collection).toBe(COOK_FOLLOW_COLLECTION);
    expect(arg.record['subject']).toBe('did:plc:alice');
    expect(typeof arg.record['createdAt']).toBe('string');
    expect(res.uri).toBe(`at://${DID}/x/r1`);
  });

  it('throws when there is no signed-in account', async () => {
    const agent = { com: { atproto: { repo: { createRecord: vi.fn() } } } } as unknown as Agent;
    await expect(followCook(agent, 'did:plc:alice')).rejects.toThrow();
  });
});

describe('unfollowCook', () => {
  it('resolves the rkey by subject, then deleteRecords it', async () => {
    const fetchFn = fetchReturning(
      listBody([
        { rkey: 'r1', subject: 'did:plc:alice' },
        { rkey: 'r2', subject: 'did:plc:bob' },
      ]),
    );
    const deleteRecord = vi.fn(async () => ({}));
    const agent = { did: DID, com: { atproto: { repo: { deleteRecord } } } } as unknown as Agent;
    await unfollowCook(agent, 'did:plc:bob', { pds: PDS, did: DID }, { fetchFn });
    expect(deleteRecord).toHaveBeenCalledWith(
      expect.objectContaining({ repo: DID, collection: COOK_FOLLOW_COLLECTION, rkey: 'r2' }),
    );
  });

  it('is a no-op delete when no matching record exists', async () => {
    const fetchFn = fetchReturning(listBody([{ rkey: 'r1', subject: 'did:plc:alice' }]));
    const deleteRecord = vi.fn(async () => ({}));
    const agent = { did: DID, com: { atproto: { repo: { deleteRecord } } } } as unknown as Agent;
    await unfollowCook(agent, 'did:plc:nobody', { pds: PDS, did: DID }, { fetchFn });
    expect(deleteRecord).not.toHaveBeenCalled();
  });
});

describe('mirrorCookFollowsDown', () => {
  it('adds PDS follows to the local store without erasing local-only rows', async () => {
    const storage = memoryStorage();
    const local = createCookFollowsLocal({ storage });
    // A local-only follow (never published) must survive the mirror.
    local.add({ did: 'did:plc:localonly', handle: 'local.test' });

    const fetchFn = fetchReturning(
      listBody([
        { rkey: 'r1', subject: 'did:plc:alice' },
        { rkey: 'r2', subject: 'did:plc:bob' },
      ]),
    );
    await mirrorCookFollowsDown(local, { pds: PDS, did: DID }, { fetchFn });

    const dids = createCookFollowsLocal({ storage }).list().map((f) => f.did);
    expect(dids).toContain('did:plc:localonly'); // local-only preserved
    expect(dids).toContain('did:plc:alice');
    expect(dids).toContain('did:plc:bob');
  });
});
