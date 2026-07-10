// Interactions. app.arecipe.interaction is our lexicon: a recipe strongRef + a
// kind ('liked') + createdAt. `liked` = one-tap public approval (heart + a
// friends-scoped count). The former `saved` kind was removed — like is now the
// single collect action (liked recipes surface via the Cookbook "Liked" filter).
// Legacy `saved` records on a PDS are read-tolerated: filtered out, never
// errored. Pure/read logic is unit-tested here; the authenticated add/remove
// writes are proven @live. Mutation-resistance edges:
//   - like count dedupes by author (two records from one author = 1)
//   - youLiked asserts both edges (present + absent)
//   - findInteractionRkey matches recipe+kind (present -> rkey, absent -> null)
//   - listInteractionsFor drops a legacy `saved` record (read-tolerance)
import { describe, expect, it, vi } from 'vitest';
import {
  INTERACTION_COLLECTION,
  buildInteractionRecord,
  findInteractionRkey,
  listInteractionsFor,
  summarize,
  withOwnInteraction,
  type Interaction,
} from '../../../src/social/interactions.js';

const RECIPE = { uri: 'at://did:plc:author0000000000000000aa/exchange.recipe.recipe/rec1', cid: 'bafyrec' };
const ME = 'did:plc:me0000000000000000000000';
const FRIEND = 'did:plc:friend0000000000000000aa';

const interaction = (over: Partial<Interaction>): Interaction => ({
  uri: `at://${ME}/${INTERACTION_COLLECTION}/i0`,
  cid: 'bafyinteraction',
  kind: 'liked',
  recipe: RECIPE,
  author: ME,
  createdAt: '2026-07-08T00:00:00Z',
  ...over,
});

describe('buildInteractionRecord', () => {
  it('builds a typed liked record with a pinned recipe strongRef', () => {
    const r = buildInteractionRecord({ kind: 'liked', recipe: RECIPE });
    expect(r.$type).toBe(INTERACTION_COLLECTION);
    expect(r.kind).toBe('liked');
    expect(r.recipe).toEqual(RECIPE);
    expect(r.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('fails loud on an unknown kind (incl. the removed `saved`)', () => {
    // @ts-expect-error — exercising the runtime guard; 'saved' is no longer a kind
    expect(() => buildInteractionRecord({ kind: 'saved', recipe: RECIPE })).toThrow(/kind/i);
    // @ts-expect-error — exercising the runtime guard
    expect(() => buildInteractionRecord({ kind: 'cooked', recipe: RECIPE })).toThrow(/kind/i);
  });

  it('fails loud when the recipe strongRef is incomplete', () => {
    expect(() => buildInteractionRecord({ kind: 'liked', recipe: { uri: RECIPE.uri, cid: '' } })).toThrow(
      /recipe/i,
    );
  });
});

describe('listInteractionsFor', () => {
  const target = { pds: 'https://pds.test', did: ME, recipeUri: RECIPE.uri };

  it('reads a repo and keeps only interactions on the target recipe', async () => {
    const other = 'at://did:plc:x/exchange.recipe.recipe/other';
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          records: [
            { uri: `at://${ME}/${INTERACTION_COLLECTION}/keep`, cid: 'c1', value: { kind: 'liked', recipe: RECIPE, createdAt: 't' } },
            { uri: `at://${ME}/${INTERACTION_COLLECTION}/drop`, cid: 'c2', value: { kind: 'liked', recipe: { uri: other, cid: 'c' }, createdAt: 't' } },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const out = await listInteractionsFor(target, { fetchFn });
    expect(out).toHaveLength(1);
    expect(out[0]!.author).toBe(ME);
    expect(out[0]!.kind).toBe('liked');
  });

  it('read-tolerates legacy `saved` records — filters them out, does not error', async () => {
    // A repo written before the save→like collapse still has a `saved` record.
    // It must be silently dropped (unknown kind filtered), leaving only the like.
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          records: [
            { uri: `at://${ME}/${INTERACTION_COLLECTION}/like`, cid: 'c1', value: { kind: 'liked', recipe: RECIPE, createdAt: 't' } },
            { uri: `at://${ME}/${INTERACTION_COLLECTION}/legacySave`, cid: 'c2', value: { kind: 'saved', recipe: RECIPE, createdAt: 't' } },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const out = await listInteractionsFor(target, { fetchFn });
    expect(out).toHaveLength(1);
    expect(out.map((i) => i.kind)).toEqual(['liked']);
  });

  it('fails loud when the PDS read errors', async () => {
    const fetchFn = vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    await expect(listInteractionsFor(target, { fetchFn })).rejects.toThrow(/500/);
  });
});

describe('summarize (friends-scoped like count + your state)', () => {
  it('dedupes the like count by author', () => {
    const set = [
      interaction({ uri: 'at://a/c/1', author: FRIEND }),
      interaction({ uri: 'at://a/c/2', author: FRIEND }), // same author, 2 records
      interaction({ uri: 'at://a/c/3', author: ME }),
    ];
    expect(summarize(set, null).likeCount).toBe(2); // FRIEND + ME, not 3
  });

  it('youLiked asserts both edges', () => {
    const liked = [interaction({ author: ME, kind: 'liked' })];
    expect(summarize(liked, ME)).toMatchObject({ youLiked: true });
    expect(summarize(liked, FRIEND)).toMatchObject({ youLiked: false, likeCount: 1 });
  });

  it('a signed-out viewer never "you"-owns anything', () => {
    expect(summarize([interaction({ author: ME })], null)).toMatchObject({
      youLiked: false,
    });
  });
});

describe('findInteractionRkey (toggle-off)', () => {
  const set = [interaction({ uri: `at://${ME}/${INTERACTION_COLLECTION}/rkLike`, kind: 'liked' })];
  it('returns the rkey of the matching recipe+kind', () => {
    expect(findInteractionRkey(set, RECIPE.uri, 'liked')).toBe('rkLike');
  });
  it('returns null when there is no matching interaction', () => {
    expect(findInteractionRkey([], RECIPE.uri, 'liked')).toBeNull();
  });
});

describe('withOwnInteraction (optimistic own-toggle)', () => {
  const mkAdded = (): Interaction =>
    interaction({ uri: `at://${ME}/${INTERACTION_COLLECTION}/new`, kind: 'liked', author: ME, recipe: RECIPE });

  it('adds the viewer’s own interaction so the count reflects it immediately', () => {
    const before = [interaction({ author: FRIEND, uri: `at://${FRIEND}/x/1` })]; // a friend already liked
    const after = withOwnInteraction(before, ME, RECIPE.uri, 'liked', mkAdded());
    expect(summarize(after, ME)).toMatchObject({ likeCount: 2, youLiked: true });
  });

  it('removes the viewer’s own like of that kind on that recipe, leaving others', () => {
    const before = [interaction({ author: ME }), interaction({ author: FRIEND, uri: `at://${FRIEND}/x/1` })];
    const after = withOwnInteraction(before, ME, RECIPE.uri, 'liked', null);
    expect(summarize(after, ME)).toMatchObject({ likeCount: 1, youLiked: false }); // friend's like remains
  });

  it('is idempotent — adding an already-present own like does not double it', () => {
    const before = [interaction({ author: ME })];
    const after = withOwnInteraction(before, ME, RECIPE.uri, 'liked', mkAdded());
    expect(after.filter((i) => i.author === ME && i.kind === 'liked')).toHaveLength(1);
    expect(summarize(after, ME).likeCount).toBe(1);
  });
});
