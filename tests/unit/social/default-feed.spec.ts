// Browse default-feed composition (D2): the default Browse feed is the
// starter-pack cooks PLUS the cooks you've followed, merged and deduped by DID
// so a cook who is both a starter and a follow appears once. Starters lead
// (curated, higher-signal handle wins on a conflict); followed cooks append in
// their stored order.
import { describe, expect, it } from 'vitest';
import { mergeCookAuthors } from '../../../src/social/default-feed.js';
import type { FeedAuthor } from '../../../src/social/feed.js';

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
