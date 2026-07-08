// Phase 9b: threaded comments. app.arecipe.comment is our lexicon (D8): a
// recipe strongRef (uri+cid, PINNED for provenance) + text + optional parent
// AT-URI (MUTABLE — threads follow the latest revision). Pure/read logic is
// unit-tested here; the authenticated write (addComment) is proven @live.
// Mutation-resistance edges asserted below:
//   - threading nests top-level / direct reply / reply-to-reply (boundary)
//   - an orphaned parent (AT-URI not in the set) renders at top level, not dropped
//   - threading keys on AT-URI, so a parent whose CID changed still nests
//   - the recipe strongRef detects an altered recipe body (same-CID vs new-CID)
import { describe, expect, it, vi } from 'vitest';
import {
  COMMENT_COLLECTION,
  buildCommentRecord,
  buildThread,
  commentOnStaleRevision,
  listCommentsFor,
  type Comment,
} from '../../../src/social/comments.js';

const RECIPE = {
  uri: 'at://did:plc:author0000000000000000aa/exchange.recipe.recipe/rec1',
  cid: 'bafyreirecipecid',
};
const AUTHOR_DID = 'did:plc:commenter00000000000000aa';

const comment = (over: Partial<Comment>): Comment => ({
  uri: `at://${AUTHOR_DID}/${COMMENT_COLLECTION}/c0`,
  cid: 'bafyreicomment0',
  author: AUTHOR_DID,
  text: 'nice',
  recipe: RECIPE,
  parent: null,
  createdAt: '2026-07-08T00:00:00Z',
  ...over,
});

describe('buildCommentRecord', () => {
  it('builds a typed record with a pinned recipe strongRef', () => {
    const record = buildCommentRecord({ recipe: RECIPE, text: '  loved it  ' });
    expect(record.$type).toBe(COMMENT_COLLECTION);
    expect(record.recipe).toEqual(RECIPE);
    expect(record.text).toBe('loved it');
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect('parent' in record).toBe(false);
  });

  it('carries the parent AT-URI when it is a reply', () => {
    const parent = `at://${AUTHOR_DID}/${COMMENT_COLLECTION}/parent1`;
    const record = buildCommentRecord({ recipe: RECIPE, text: 'agreed', parent });
    expect(record.parent).toBe(parent);
  });

  it('fails loud on empty text', () => {
    expect(() => buildCommentRecord({ recipe: RECIPE, text: '   ' })).toThrow(/text/i);
  });

  it('fails loud when the recipe strongRef is incomplete', () => {
    expect(() => buildCommentRecord({ recipe: { uri: RECIPE.uri, cid: '' }, text: 'x' })).toThrow(
      /recipe/i,
    );
  });
});

describe('listCommentsFor', () => {
  const target = { pds: 'https://pds.test', did: AUTHOR_DID, recipeUri: RECIPE.uri };

  it('reads a repo and keeps only comments on the target recipe', async () => {
    const other = 'at://did:plc:x/exchange.recipe.recipe/otherrec';
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          records: [
            {
              uri: `at://${AUTHOR_DID}/${COMMENT_COLLECTION}/keep`,
              cid: 'bafyreikeep',
              value: { recipe: RECIPE, text: 'on target', createdAt: '2026-07-08T00:00:00Z' },
            },
            {
              uri: `at://${AUTHOR_DID}/${COMMENT_COLLECTION}/drop`,
              cid: 'bafyreidrop',
              value: {
                recipe: { uri: other, cid: 'bafyreiother' },
                text: 'different recipe',
                createdAt: '2026-07-08T00:00:00Z',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const comments = await listCommentsFor(target, { fetchFn });
    expect(comments).toHaveLength(1);
    expect(comments[0]!.text).toBe('on target');
    expect(comments[0]!.author).toBe(AUTHOR_DID);
    expect(comments[0]!.parent).toBeNull();
    const url = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toContain(encodeURIComponent(COMMENT_COLLECTION));
  });

  it('fails loud when the PDS read errors', async () => {
    const fetchFn = vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    await expect(listCommentsFor(target, { fetchFn })).rejects.toThrow(/500/);
  });
});

describe('buildThread', () => {
  const parentUri = `at://${AUTHOR_DID}/${COMMENT_COLLECTION}/p`;
  const childUri = `at://${AUTHOR_DID}/${COMMENT_COLLECTION}/c`;
  const grandchildUri = `at://${AUTHOR_DID}/${COMMENT_COLLECTION}/g`;

  it('nests top-level → reply → reply-to-reply (boundary)', () => {
    const thread = buildThread([
      comment({ uri: parentUri, text: 'root', createdAt: '2026-07-08T00:00:01Z' }),
      comment({ uri: childUri, parent: parentUri, text: 'reply', createdAt: '2026-07-08T00:00:02Z' }),
      comment({
        uri: grandchildUri,
        parent: childUri,
        text: 'reply to reply',
        createdAt: '2026-07-08T00:00:03Z',
      }),
    ]);
    expect(thread).toHaveLength(1);
    expect(thread[0]!.text).toBe('root');
    expect(thread[0]!.replies).toHaveLength(1);
    expect(thread[0]!.replies[0]!.text).toBe('reply');
    expect(thread[0]!.replies[0]!.replies[0]!.text).toBe('reply to reply');
  });

  it('renders an orphaned parent (unknown AT-URI) at top level, never dropped', () => {
    const orphan = comment({
      uri: childUri,
      parent: 'at://did:plc:gone/app.arecipe.comment/missing',
      text: 'orphan',
    });
    const thread = buildThread([orphan]);
    expect(thread).toHaveLength(1);
    expect(thread[0]!.text).toBe('orphan');
  });

  it('threads on AT-URI, so a parent whose CID changed still nests the reply', () => {
    // The parent was edited (new CID) but keeps its AT-URI — the reply still nests.
    const thread = buildThread([
      comment({ uri: parentUri, cid: 'bafyreiEDITEDcid', text: 'edited root' }),
      comment({ uri: childUri, parent: parentUri, text: 'still nested' }),
    ]);
    expect(thread).toHaveLength(1);
    expect(thread[0]!.replies[0]!.text).toBe('still nested');
  });
});

describe('commentOnStaleRevision (recipe strongRef, both edges)', () => {
  it('is false when the comment pins the current recipe CID', () => {
    expect(commentOnStaleRevision(comment({}), RECIPE.cid)).toBe(false);
  });

  it('is true when the recipe moved on since the comment was made', () => {
    expect(commentOnStaleRevision(comment({}), 'bafyreiNEWrecipecid')).toBe(true);
  });
});
