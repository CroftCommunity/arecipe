// Phase 9a: the friends social graph. app.arecipe.friend is our own lexicon
// (D8) — a public follow naming a DID: { subject, createdAt }. Pure/read
// logic is unit-tested here; the authenticated add/remove WRITES are proven
// in the @live tier (tests/e2e/friends-live.spec.ts), mirroring Phase 6.
// Behaviors:
// - buildFriendRecord produces a typed record and fails loud on a non-DID
// - listFriends parses public listRecords into {uri, subject, createdAt}
// - findFriendRkey matches by subject (BOTH edges: present → rkey, absent → null)
import { describe, expect, it, vi } from 'vitest';
import {
  FRIEND_COLLECTION,
  buildFriendRecord,
  findFriendRkey,
  listFriends,
} from '../../../src/social/friends.js';

const SUBJECT = 'did:plc:cccccccccccccccccccccccc';

describe('buildFriendRecord', () => {
  it('builds a typed app.arecipe.friend record naming the subject DID', () => {
    const record = buildFriendRecord(SUBJECT);
    expect(record.$type).toBe(FRIEND_COLLECTION);
    expect(record.subject).toBe(SUBJECT);
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('fails loud when the subject is not a DID', () => {
    expect(() => buildFriendRecord('not-a-did')).toThrow(/did/i);
    expect(() => buildFriendRecord('')).toThrow(/did/i);
  });
});

describe('listFriends', () => {
  const target = { pds: 'https://pds.test', did: 'did:plc:owwwwwwwwwwwwwwwwwwwwwwww' };

  it('parses public listRecords into friend entries', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          records: [
            {
              uri: `at://${target.did}/${FRIEND_COLLECTION}/rk1`,
              value: { subject: SUBJECT, createdAt: '2026-07-08T00:00:00Z' },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const friends = await listFriends(target, { fetchFn });
    expect(friends).toHaveLength(1);
    expect(friends[0]).toEqual({
      uri: `at://${target.did}/${FRIEND_COLLECTION}/rk1`,
      subject: SUBJECT,
      createdAt: '2026-07-08T00:00:00Z',
    });
    // Reads the friend collection on the target's PDS.
    const calledUrl = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain(target.pds);
    expect(calledUrl).toContain(encodeURIComponent(FRIEND_COLLECTION));
  });

  it('returns an empty list when the repo has no friend records', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ records: [] }), { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await listFriends(target, { fetchFn })).toEqual([]);
  });

  it('fails loud when the PDS read errors', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    await expect(listFriends(target, { fetchFn })).rejects.toThrow(/500/);
  });
});

describe('findFriendRkey (remove-by-subject)', () => {
  const records = [
    { uri: `at://x/${FRIEND_COLLECTION}/rkA`, subject: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', createdAt: 't' },
    { uri: `at://x/${FRIEND_COLLECTION}/rkB`, subject: SUBJECT, createdAt: 't' },
  ];

  it('returns the rkey of the record matching the subject', () => {
    expect(findFriendRkey(records, SUBJECT)).toBe('rkB');
  });

  it('returns null when no record matches the subject', () => {
    expect(findFriendRkey(records, 'did:plc:zzzzzzzzzzzzzzzzzzzzzzzz')).toBeNull();
  });
});
