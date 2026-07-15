// Cook follows — device-local tier (D4/D5). A durable localStorage list of the
// cooks you've followed ({ did, handle }), the universal read model Browse reads
// (zero-auth bundle) and signed-in pages mirror the PDS down into. Unlike the
// prefs stores (which persist the DISABLED exception), this is additive user data
// — the full list is stored. Behaviors:
//   - add/list/remove/has round-trip through storage
//   - duplicate add (same did) is idempotent
//   - corrupt storage reads as empty (never throws)
//   - write failure degrades silently (never throws)
//   - the { did, handle } shape is preserved
import { describe, expect, it, vi } from 'vitest';
import { createCookFollowsLocal } from '../../../src/social/cook-follows-local.js';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
};

const A = { did: 'did:plc:aaa', handle: 'alice.test' };
const B = { did: 'did:plc:bbb', handle: 'bob.test' };

describe('createCookFollowsLocal', () => {
  it('starts empty', () => {
    const local = createCookFollowsLocal({ storage: memoryStorage() });
    expect(local.list()).toEqual([]);
    expect(local.has(A.did)).toBe(false);
  });

  it('add/list/remove/has round-trip through storage, preserving { did, handle }', () => {
    const storage = memoryStorage();
    const local = createCookFollowsLocal({ storage });
    local.add(A);
    local.add(B);

    const fresh = createCookFollowsLocal({ storage });
    expect(fresh.list()).toEqual([A, B]);
    expect(fresh.has(A.did)).toBe(true);
    expect(fresh.has('did:plc:missing')).toBe(false);

    fresh.remove(A.did);
    expect(createCookFollowsLocal({ storage }).list()).toEqual([B]);
    expect(createCookFollowsLocal({ storage }).has(A.did)).toBe(false);
  });

  it('duplicate add (same did) is idempotent', () => {
    const storage = memoryStorage();
    const local = createCookFollowsLocal({ storage });
    local.add(A);
    local.add({ did: A.did, handle: 'alice-renamed.test' });
    expect(local.list()).toHaveLength(1);
    expect(local.has(A.did)).toBe(true);
  });

  it('reads corrupt storage as empty, without throwing', () => {
    const storage = memoryStorage();
    storage.setItem('cook-follows', '{not json');
    const local = createCookFollowsLocal({ storage });
    expect(local.list()).toEqual([]);
    expect(local.has(A.did)).toBe(false);
  });

  it('degrades silently when writes throw', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('quota');
      },
    };
    const local = createCookFollowsLocal({ storage: broken });
    expect(() => local.add(A)).not.toThrow();
    expect(() => local.remove(A.did)).not.toThrow();
  });

  it('reads default (empty) when storage getItem throws', () => {
    const warn = vi.fn();
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    void warn;
    const local = createCookFollowsLocal({ storage: broken });
    expect(local.list()).toEqual([]);
  });
});
