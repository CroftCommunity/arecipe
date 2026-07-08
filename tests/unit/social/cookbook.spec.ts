// Cookbook scope module (CB1): resolves the cookbook's member repos (depth 0 —
// direct membership) from the enabled sources — you + starter cooks + your
// Bluesky follows + your Bluesky followers — honoring an injectable reach
// config and fetch. Merge/dedup by DID, union the source tags, degrade (never
// throw) when one source fails. Consumed by the recipe page's comment/like
// discovery, the Cookbook tab, and the feed. Behaviors under test:
//  - every source contributes, tagged, in priority order (you → starter →
//    follow → follower) so a downstream cap favors high-signal sources
//  - a DID from two sources dedups to one member with unioned sources
//  - a follower's handle.invalid drops the handle but keeps the DID
//  - a failing source degrades (warns) — the others still resolve
//  - config toggles skip a source (no wasted request)
//  - without `you`, follows/followers are skipped (they need your repo)
import { describe, expect, it, vi } from 'vitest';
import { resolveCookbook } from '../../../src/social/cookbook.js';
import type { FeedAuthor } from '../../../src/social/feed.js';

const YOU = { did: 'did:plc:you0000000000000000000a', pds: 'https://you.pds.test' };
const STARTERS: FeedAuthor[] = [{ handle: 'cook.one', did: 'did:plc:starter00000000000000a' }];

/** Route a fake fetch by URL: follows off the PDS, followers off the AppView. */
const router = (opts: {
  follows?: string[];
  followers?: { did: string; handle?: string }[];
  followsStatus?: number;
  followersStatus?: number;
}): typeof fetch =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('app.bsky.graph.follow') && url.includes('listRecords')) {
      if ((opts.followsStatus ?? 200) >= 400) return new Response('{}', { status: opts.followsStatus });
      return new Response(
        JSON.stringify({ records: (opts.follows ?? []).map((subject) => ({ value: { subject } })) }),
      );
    }
    if (url.includes('app.bsky.graph.getFollowers')) {
      if ((opts.followersStatus ?? 200) >= 400) return new Response('{}', { status: opts.followersStatus });
      return new Response(JSON.stringify({ followers: opts.followers ?? [] }));
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;

describe('resolveCookbook', () => {
  it('includes every source tagged, in priority order (you → starter → follow → follower)', async () => {
    const fetchFn = router({
      follows: ['did:plc:follow0000000000000000a'],
      followers: [{ did: 'did:plc:follower000000000000a', handle: 'fan.one' }],
    });
    const members = await resolveCookbook({ you: YOU, starters: STARTERS, fetchFn });
    const didsFor = (s: string) => members.filter((m) => m.sources.includes(s as never)).map((m) => m.did);
    expect(members[0]?.sources).toContain('you'); // you is first for the downstream cap
    expect(didsFor('you')).toEqual([YOU.did]);
    expect(didsFor('starter')).toEqual([STARTERS[0]!.did]);
    expect(didsFor('follow')).toEqual(['did:plc:follow0000000000000000a']);
    expect(didsFor('follower')).toEqual(['did:plc:follower000000000000a']);
    expect(members.find((m) => m.did === 'did:plc:follower000000000000a')?.handle).toBe('fan.one');
  });

  it('dedups a DID that is both a follow and a follower, unioning the source tags', async () => {
    const dup = 'did:plc:dup00000000000000000a';
    const fetchFn = router({ follows: [dup], followers: [{ did: dup, handle: 'dup.h' }] });
    const members = await resolveCookbook({ you: YOU, starters: [], fetchFn });
    const hit = members.filter((m) => m.did === dup);
    expect(hit).toHaveLength(1);
    expect([...hit[0]!.sources].sort()).toEqual(['follow', 'follower']);
  });

  it('keeps a follower DID but drops a handle.invalid handle', async () => {
    const fetchFn = router({ followers: [{ did: 'did:plc:inv000000000000000a', handle: 'handle.invalid' }] });
    const members = await resolveCookbook({
      you: YOU,
      starters: [],
      config: { starters: false, follows: false, followers: true },
      fetchFn,
    });
    const m = members.find((x) => x.did === 'did:plc:inv000000000000000a');
    expect(m).toBeDefined();
    expect(m?.handle).toBeUndefined();
  });

  it('degrades (does not throw) when a source fails — the other sources still resolve', async () => {
    const fetchFn = router({ followsStatus: 500, followers: [{ did: 'did:plc:follower000000000000a' }] });
    const members = await resolveCookbook({ you: YOU, starters: STARTERS, fetchFn });
    expect(members.some((m) => m.sources.includes('follow'))).toBe(false); // failed source contributes nothing
    expect(members.some((m) => m.sources.includes('starter'))).toBe(true);
    expect(members.some((m) => m.sources.includes('follower'))).toBe(true);
    expect(members.some((m) => m.sources.includes('you'))).toBe(true);
  });

  it('honors the reach config: followers disabled → no getFollowers request', async () => {
    const fetchFn = router({ follows: ['did:plc:follow0000000000000000a'] });
    await resolveCookbook({
      you: YOU,
      starters: [],
      config: { starters: false, follows: true, followers: false },
      fetchFn,
    });
    const urls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('getFollowers'))).toBe(false);
    expect(urls.some((u) => u.includes('app.bsky.graph.follow'))).toBe(true);
  });

  it('without `you`, skips follows/followers (they need your repo) but still returns starters', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('should not fetch without you');
    }) as unknown as typeof fetch;
    const members = await resolveCookbook({
      starters: STARTERS,
      config: { starters: true, follows: true, followers: true },
      fetchFn,
    });
    expect(members.map((m) => m.did)).toEqual([STARTERS[0]!.did]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
