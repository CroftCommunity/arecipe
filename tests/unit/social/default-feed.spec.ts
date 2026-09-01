// Browse default-feed composition (D2): the default Browse feed is the
// starter-pack cooks PLUS the cooks you've followed, merged and deduped by DID
// so a cook who is both a starter and a follow appears once. Starters lead
// (curated, higher-signal handle wins on a conflict); followed cooks append in
// their stored order.
import { describe, expect, it } from 'vitest';
import { loadSnapshotFirstFeed, mergeCookAuthors } from '../../../src/social/default-feed.js';
import type { FeedAuthor } from '../../../src/social/feed.js';
import type { CachedRecipe } from '../../../src/recipes/cache.js';

const A: FeedAuthor = { handle: 'starter.one', did: 'did:plc:s1' };
const B: FeedAuthor = { handle: 'starter.two', did: 'did:plc:s2' };
const F: FeedAuthor = { handle: 'follow.one', did: 'did:plc:f1' };

describe('mergeCookAuthors', () => {
  it('unions starters and follows, starters first, follows appended', () => {
    expect(mergeCookAuthors([A, B], [F])).toEqual([A, B, F]);
  });

  it('dedupes by DID — a cook who is both a starter and a follow appears once', () => {
    // Same DID as A, different handle: the starter entry wins.
    const dupFollow: FeedAuthor = { handle: 'renamed.one', did: 'did:plc:s1' };
    const merged = mergeCookAuthors([A], [dupFollow, F]);
    expect(merged).toEqual([A, F]);
    expect(merged.filter((m) => m.did === 'did:plc:s1')).toHaveLength(1);
  });

  it('handles empty inputs', () => {
    expect(mergeCookAuthors([], [])).toEqual([]);
    expect(mergeCookAuthors([], [F])).toEqual([F]);
    expect(mergeCookAuthors([A], [])).toEqual([A]);
  });

  it('dedupes duplicate follows against each other', () => {
    const dup: FeedAuthor = { handle: 'follow.one.again', did: 'did:plc:f1' };
    expect(mergeCookAuthors([], [F, dup])).toEqual([F]);
  });
});

// Recipe-loading perf: consumers of the default feed OUTSIDE Browse (the meal
// planner's Browse palette source) must not re-page the whole corpus live from
// the PDS on every visit. loadSnapshotFirstFeed serves snapshot-covered cooks
// from the precached bundle (with the hydration fast path underneath) and
// live-loads ONLY the authors the snapshot doesn't cover.
describe('loadSnapshotFirstFeed', () => {
  const entry = (did: string, rkey: string, name: string): CachedRecipe => ({
    uri: `at://${did}/exchange.recipe.recipe/${rkey}`,
    cid: `cid-${rkey}`,
    value: { name },
    verified: true,
    cachedAt: '2026-08-11T00:00:00Z',
  });
  const S1 = 'did:plc:s1';
  const S2 = 'did:plc:s2';
  const F1 = 'did:plc:f1';

  const fakeSnapshot = (entries: CachedRecipe[], cookDids: string[]) => async () => ({
    entries,
    authorsByDid: Object.fromEntries(cookDids.map((d) => [d, `${d}.handle`])),
    index: {
      buildId: 'dev',
      cooks: cookDids.map((did) => ({ did, handle: `${did}.handle`, displayName: '', recipes: [] })),
    },
  });

  it('serves snapshot-covered cooks from the snapshot and never live-loads them', async () => {
    const liveCalls: FeedAuthor[][] = [];
    const feed = await loadSnapshotFirstFeed(
      [
        { handle: 'starter.one', did: S1 },
        { handle: 'starter.two', did: S2 },
      ],
      {
        loadSnapshot: fakeSnapshot([entry(S1, 'r1', 'One'), entry(S2, 'r2', 'Two')], [S1, S2]),
        loadLive: async (authors) => {
          liveCalls.push(authors);
          return { entries: [], authorsByDid: {}, failedAuthors: [], cachedAuthors: [] };
        },
      },
    );
    expect(feed.entries.map((e) => String(e.value['name'])).sort()).toEqual(['One', 'Two']);
    expect(liveCalls).toEqual([]); // zero PDS work
  });

  it('live-loads only the authors the snapshot does not cover', async () => {
    const liveCalls: FeedAuthor[][] = [];
    const feed = await loadSnapshotFirstFeed(
      [
        { handle: 'starter.one', did: S1 },
        { handle: 'follow.one', did: F1 },
      ],
      {
        loadSnapshot: fakeSnapshot([entry(S1, 'r1', 'One')], [S1]),
        loadLive: async (authors) => {
          liveCalls.push(authors);
          return {
            entries: [entry(F1, 'r9', 'Followed')],
            authorsByDid: { [F1]: 'follow.one' },
            failedAuthors: [],
            cachedAuthors: [],
          };
        },
      },
    );
    expect(liveCalls).toEqual([[{ handle: 'follow.one', did: F1 }]]);
    expect(feed.entries.map((e) => String(e.value['name'])).sort()).toEqual(['Followed', 'One']);
    expect(feed.authorsByDid[F1]).toBe('follow.one');
  });

  it('ignores snapshot entries for cooks outside the requested author set', async () => {
    const feed = await loadSnapshotFirstFeed([{ handle: 'starter.one', did: S1 }], {
      loadSnapshot: fakeSnapshot([entry(S1, 'r1', 'One'), entry(S2, 'r2', 'Stranger')], [S1, S2]),
      loadLive: async () => ({ entries: [], authorsByDid: {}, failedAuthors: [], cachedAuthors: [] }),
    });
    expect(feed.entries.map((e) => String(e.value['name']))).toEqual(['One']);
  });

  it('falls back to a full live load when there is no snapshot', async () => {
    const liveCalls: FeedAuthor[][] = [];
    const authors: FeedAuthor[] = [
      { handle: 'starter.one', did: S1 },
      { handle: 'follow.one', did: F1 },
    ];
    const feed = await loadSnapshotFirstFeed(authors, {
      loadSnapshot: async () => null,
      loadLive: async (a) => {
        liveCalls.push(a);
        return { entries: [entry(S1, 'r1', 'One')], authorsByDid: { [S1]: 'starter.one' }, failedAuthors: [], cachedAuthors: [] };
      },
    });
    expect(liveCalls).toEqual([authors]);
    expect(feed.entries).toHaveLength(1);
  });

  it('degrades to live when the snapshot loader throws (never blanks)', async () => {
    const feed = await loadSnapshotFirstFeed([{ handle: 'starter.one', did: S1 }], {
      loadSnapshot: async () => {
        throw new Error('corrupt snapshot');
      },
      loadLive: async () => ({ entries: [entry(S1, 'r1', 'One')], authorsByDid: { [S1]: 'starter.one' }, failedAuthors: [], cachedAuthors: [] }),
    });
    expect(feed.entries).toHaveLength(1);
  });
});
