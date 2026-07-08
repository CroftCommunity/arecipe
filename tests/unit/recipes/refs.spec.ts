// Phase 8: strongRefs + staleness. Both edges asserted (Pass 3 mutation
// resistance): same CID → NOT stale; different CID → stale.
import { describe, expect, it } from 'vitest';
import { isStale, sameRevision, strongRefOf } from '../../../src/recipes/refs.js';

const entry = {
  uri: 'at://did:plc:abc/exchange.recipe.recipe/3kxyz',
  cid: 'bafyreiaaa',
};

describe('strongRefOf', () => {
  it('pins uri + cid (com.atproto.repo.strongRef shape)', () => {
    expect(strongRefOf(entry)).toEqual({ uri: entry.uri, cid: 'bafyreiaaa' });
  });
});

describe('sameRevision / isStale', () => {
  it('matching CIDs are the same revision — no stale flag', () => {
    expect(sameRevision('bafyreiaaa', 'bafyreiaaa')).toBe(true);
    expect(isStale({ pinnedCid: 'bafyreiaaa', currentCid: 'bafyreiaaa' })).toBe(false);
  });

  it('differing CIDs are stale', () => {
    expect(sameRevision('bafyreiaaa', 'bafyreibbb')).toBe(false);
    expect(isStale({ pinnedCid: 'bafyreiaaa', currentCid: 'bafyreibbb' })).toBe(true);
  });
});
