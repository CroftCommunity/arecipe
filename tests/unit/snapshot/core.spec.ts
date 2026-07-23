// D1: the build-time snapshot generator core. The load-bearing correctness
// property is torn-shard prevention: getLatestCommit → listRecords → re-check
// getLatestCommit; if the rev moved during pagination the shard is torn and
// MUST be recaptured, and a torn shard paired with the newer rev must never be
// emitted (else the app never notices it is wrong). These tests pin that plus
// sha256 integrity, unreachable-cook omission, and corpus sharding.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  captureCook,
  snapshotCook,
  serializeShard,
  shardRecords,
  sha256Hex,
} from '../../../scripts/lib/snapshot-core.mjs';

type Rec = { uri: string; cid: string; value: Record<string, unknown> };

const recipe = (did: string, rkey: string, name: string): Rec => ({
  uri: `at://${did}/exchange.recipe.recipe/${rkey}`,
  cid: `bafyrei${rkey}`,
  value: {
    name,
    text: 't',
    ingredients: ['i'],
    instructions: ['s'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
});

/** A fake PDS. `revs` is the sequence returned by successive getLatestCommit
 * calls (the last entry repeats). Pages listRecords 2-at-a-time to exercise the
 * cursor. `countCalls` records how many of each XRPC method were hit. */
const fakePds = (opts: { records: Rec[]; revs: string[]; pageSize?: number }) => {
  const pageSize = opts.pageSize ?? 2;
  let commitCall = 0;
  const calls = { getLatestCommit: 0, listRecords: 0 };
  const fetchImpl = async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith('com.atproto.sync.getLatestCommit')) {
      const rev = opts.revs[Math.min(commitCall, opts.revs.length - 1)]!;
      commitCall += 1;
      calls.getLatestCommit += 1;
      return { ok: true, status: 200, json: async () => ({ rev, cid: `commit-${rev}` }) };
    }
    if (u.pathname.endsWith('com.atproto.repo.listRecords')) {
      calls.listRecords += 1;
      const cursor = u.searchParams.get('cursor');
      const start = cursor === null ? 0 : Number(cursor);
      const page = opts.records.slice(start, start + pageSize);
      const nextStart = start + pageSize;
      const next = nextStart < opts.records.length ? String(nextStart) : undefined;
      return { ok: true, status: 200, json: async () => ({ records: page, cursor: next }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, calls };
};

const DID = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const resolveOk = async () => ({ pds: 'https://pds.test' });

describe('captureCook — torn-shard prevention', () => {
  it('recaptures exactly once when the rev moves mid-pagination, and pairs records with the settled rev', async () => {
    const records = [recipe(DID, 'a', 'A'), recipe(DID, 'b', 'B'), recipe(DID, 'c', 'C')];
    // First capture: before=rev1, (list), after=rev2 → torn → retry.
    // Second capture: before=rev2, (list), after=rev2 → settled.
    const { fetchImpl, calls } = fakePds({ records, revs: ['rev1', 'rev2', 'rev2', 'rev2'] });
    const cap = await captureCook({ fetchImpl, pds: 'https://pds.test', did: DID, collection: 'exchange.recipe.recipe' });
    expect(cap.attempts).toBe(2); // exactly one retry
    expect(cap.rev).toBe('rev2'); // the settled rev, never the torn rev1
    expect(cap.records).toHaveLength(3);
    // Two full captures × 2 getLatestCommit each = 4.
    expect(calls.getLatestCommit).toBe(4);
  });

  it('fails (does not emit a torn shard) when the repo never settles', async () => {
    const records = [recipe(DID, 'a', 'A')];
    // Every after-rev differs from its before-rev → never settles.
    const { fetchImpl } = fakePds({ records, revs: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'] });
    await expect(
      captureCook({ fetchImpl, pds: 'https://pds.test', did: DID, collection: 'exchange.recipe.recipe', maxAttempts: 3 }),
    ).rejects.toThrow(/torn|committing|settle/i);
  });

  it('captures in one attempt when the repo is quiescent', async () => {
    const records = [recipe(DID, 'a', 'A'), recipe(DID, 'b', 'B')];
    const { fetchImpl, calls } = fakePds({ records, revs: ['stable'] });
    const cap = await captureCook({ fetchImpl, pds: 'https://pds.test', did: DID, collection: 'exchange.recipe.recipe' });
    expect(cap.attempts).toBe(1);
    expect(cap.rev).toBe('stable');
    expect(calls.getLatestCommit).toBe(2); // before + after, once
  });
});

describe('snapshotCook — manifest, shard, index', () => {
  it("produces a manifest whose sha256 matches the shard file's bytes", async () => {
    const records = [recipe(DID, 'a', 'Apple'), recipe(DID, 'b', 'Bread')];
    const { fetchImpl } = fakePds({ records, revs: ['stable'] });
    const out = await snapshotCook({
      fetchImpl,
      resolveImpl: resolveOk,
      cook: { did: DID, handle: 'a.example.com' },
      collection: 'exchange.recipe.recipe',
      capturedAt: '2026-07-23T00:00:00Z',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // The single shard's bytes hash to the manifest's declared sha256.
    expect(out.manifest.shards).toHaveLength(1);
    const shardFile = out.shards[0]!;
    const bytes = serializeShard(shardFile.shard);
    const digest = createHash('sha256').update(bytes).digest('hex');
    expect(out.manifest.shards[0]!.sha256).toBe(digest);
    expect(out.manifest.recordCount).toBe(2);
    expect(out.manifest.rev).toBe('stable');
    expect(out.manifest.capturedAt).toBe('2026-07-23T00:00:00Z');
    // index carries only identity + titles + rkeys (no bodies).
    expect(out.indexCook.recipes.map((r) => r.title)).toEqual(['Apple', 'Bread']);
    expect(out.indexCook.recipes.map((r) => r.rkey)).toEqual(['a', 'b']);
    expect(JSON.stringify(out.indexCook)).not.toContain('ingredients');
  });

  it('omits an unreachable cook with a recorded reason instead of failing', async () => {
    const out = await snapshotCook({
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
      resolveImpl: resolveOk,
      cook: { did: DID, handle: 'down.example.com' },
      collection: 'exchange.recipe.recipe',
      capturedAt: '2026-07-23T00:00:00Z',
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.did).toBe(DID);
    expect(out.handle).toBe('down.example.com');
    expect(out.reason).toMatch(/ECONNREFUSED/);
  });
});

describe('shardRecords — corpus sharding (D6)', () => {
  it('splits a large record set into fixed-size shards', () => {
    const records = Array.from({ length: 5 }, (_, i) => recipe(DID, `k${i}`, `R${i}`));
    const chunks = shardRecords(records, 2);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.length)).toEqual([2, 2, 1]);
  });

  it('keeps a single shard when under the threshold', () => {
    const records = [recipe(DID, 'a', 'A')];
    expect(shardRecords(records, 500)).toHaveLength(1);
  });
});

describe('sha256Hex', () => {
  it('hashes a string deterministically', () => {
    expect(sha256Hex('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });
});
