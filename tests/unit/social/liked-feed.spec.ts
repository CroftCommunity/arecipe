// Phase 9: the by-recipe-URI liked loader. Unlike loadAuthorsFeed (by author),
// loadLikedFeed resolves each liked ref's DID→PDS (cross-PDS) and reads that one
// record. Edges asserted: cross-PDS load, empty-ref filtering, the discovery
// cap, and one bad ref skipped without blanking the feed.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLikedFeed } from '../../../src/social/liked-feed.js';
import { INTERACTION_COLLECTION, type Interaction } from '../../../src/social/interactions.js';

const DID_A = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const DID_B = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const PDS_A = 'https://a.test';
const PDS_B = 'https://b.test';
const pdsByDid: Record<string, string> = { [DID_A]: PDS_A, [DID_B]: PDS_B };

const recipeUri = (did: string, rkey: string): string =>
  `at://${did}/exchange.recipe.recipe/${rkey}`;

const like = (did: string, rkey: string): Interaction => ({
  uri: `at://${did}/${INTERACTION_COLLECTION}/${rkey}like`,
  cid: 'bafylike',
  kind: 'liked',
  recipe: { uri: recipeUri(did, rkey), cid: 'bafyref' },
  author: did,
  createdAt: '2026-07-08T00:00:00Z',
});

const getRecordHosts: string[] = [];

const stubNetwork = (): void => {
  getRecordHosts.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('plc.directory')) {
        const did = decodeURIComponent(u.split('/').pop() ?? '');
        const pds = pdsByDid[did] ?? 'https://unknown.test';
        return new Response(
          JSON.stringify({
            id: did,
            alsoKnownAs: [`at://${did}.example.com`],
            service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: pds }],
          }),
          { status: 200 },
        );
      }
      if (u.includes('getRecord')) {
        const params = new URL(u).searchParams;
        const rkey = params.get('rkey') ?? '';
        const repo = params.get('repo') ?? '';
        getRecordHosts.push(new URL(u).host);
        if (rkey === 'missing') return new Response('{}', { status: 404 });
        return new Response(
          JSON.stringify({
            uri: recipeUri(repo, rkey),
            cid: `bafy${rkey}`,
            value: {
              name: `Recipe ${rkey}`,
              text: 't',
              ingredients: ['i'],
              instructions: ['s'],
              createdAt: '2026-07-08T00:00:00Z',
              updatedAt: '2026-07-08T00:00:00Z',
            },
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${u}`);
    }),
  );
};

afterEach(() => vi.unstubAllGlobals());

describe('loadLikedFeed', () => {
  it('loads each liked recipe by ref, resolving DID→PDS per ref (cross-PDS)', async () => {
    stubNetwork();
    const feed = await loadLikedFeed([like(DID_A, 'r1'), like(DID_B, 'r2')]);
    expect(feed.map((e) => (e.value as { name?: string }).name).sort()).toEqual([
      'Recipe r1',
      'Recipe r2',
    ]);
    // Proves per-ref resolution: the two records were fetched from DIFFERENT PDSes.
    expect(new Set(getRecordHosts)).toEqual(new Set(['a.test', 'b.test']));
  });

  it('filters empty refs (the {uri:""} fallback) without erroring', async () => {
    stubNetwork();
    const empty: Interaction = { ...like(DID_A, 'r1'), recipe: { uri: '', cid: '' } };
    const feed = await loadLikedFeed([like(DID_A, 'r1'), empty]);
    expect(feed).toHaveLength(1);
    expect((feed[0]!.value as { name?: string }).name).toBe('Recipe r1');
  });

  it('caps discovery at the requested limit', async () => {
    stubNetwork();
    const feed = await loadLikedFeed([like(DID_A, 'r1'), like(DID_B, 'r2')], { cap: 1 });
    expect(feed).toHaveLength(1);
  });

  it('skips a ref that fails to load, keeping the rest (never blanks the feed)', async () => {
    stubNetwork();
    const feed = await loadLikedFeed([like(DID_A, 'r1'), like(DID_A, 'missing')]);
    expect(feed.map((e) => (e.value as { name?: string }).name)).toEqual(['Recipe r1']);
  });
});
