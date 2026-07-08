// @vitest-environment happy-dom
// Phase 9b: rendering the comment thread on the recipe page. renderComments
// lives in src/social/comments-view.ts (not view.ts, which carries unrelated
// WIP) — the plan sanctions this alternative. Behaviors:
//   - nested replies render as nested DOM (thread structure survives)
//   - author names link to Bluesky profiles (handle from authorsByDid, else DID)
//   - a comment made on an older recipe revision is flagged (both edges)
import { describe, expect, it } from 'vitest';
import { COMMENT_COLLECTION, type CommentNode } from '../../../src/social/comments.js';
import { renderComments } from '../../../src/social/comments-view.js';

const RECIPE = { uri: 'at://did:plc:a/exchange.recipe.recipe/r', cid: 'bafyrecurrent' };
const DID = 'did:plc:commenter00000000000000aa';

const node = (over: Partial<CommentNode>): CommentNode => ({
  uri: `at://${DID}/${COMMENT_COLLECTION}/c0`,
  cid: 'bafycomment',
  author: DID,
  text: 'nice recipe',
  recipe: RECIPE,
  parent: null,
  createdAt: '2026-07-08T00:00:00Z',
  replies: [],
  ...over,
});

describe('renderComments', () => {
  it('renders a nested thread as nested DOM', () => {
    const thread = [
      node({
        text: 'root',
        replies: [node({ uri: `at://${DID}/${COMMENT_COLLECTION}/c1`, text: 'a reply', replies: [] })],
      }),
    ];
    const root = renderComments(thread, { recipeCid: RECIPE.cid });
    const items = root.querySelectorAll('[data-testid=comment-item]');
    expect(items).toHaveLength(2);
    // The reply is nested inside the root comment, not a sibling.
    const rootItem = root.querySelector('[data-testid=comment-item]');
    expect(rootItem?.querySelector('[data-testid=comment-item]')?.textContent).toContain('a reply');
  });

  it('links author names to their Bluesky profile (handle when known)', () => {
    const root = renderComments([node({})], {
      recipeCid: RECIPE.cid,
      authorsByDid: { [DID]: 'chef.bsky.social' },
    });
    const link = root.querySelector<HTMLAnchorElement>('[data-testid=comment-author]');
    expect(link?.getAttribute('href')).toBe('https://bsky.app/profile/chef.bsky.social');
  });

  it('flags a comment made on an older recipe revision (stale edge)', () => {
    const stale = renderComments([node({ recipe: { uri: RECIPE.uri, cid: 'bafyOLD' } })], {
      recipeCid: RECIPE.cid,
    });
    expect(stale.querySelector('[data-testid=comment-stale]')).not.toBeNull();
    // Negative edge: a current-revision comment carries no stale marker.
    const fresh = renderComments([node({})], { recipeCid: RECIPE.cid });
    expect(fresh.querySelector('[data-testid=comment-stale]')).toBeNull();
  });
});
