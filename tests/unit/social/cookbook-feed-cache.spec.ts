// Phase (post-1.0 polish): the cookbook feed's stale-while-revalidate metadata —
// the last-resolved author set + when it was fetched — persisted so the page can
// paint from the IndexedDB recipe cache immediately, then revalidate. Plus the
// bottom "as of …" freshness phrasing.
import { describe, expect, it } from 'vitest';
import {
  readFeedMeta,
  relativeFreshness,
  writeFeedMeta,
} from '../../../src/social/cookbook-feed-cache.js';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
};

const DID = 'did:plc:me0000000000000000000000';
const authors = [
  { handle: 'a.example.com', did: 'did:plc:a' },
  { handle: 'b.example.com', did: 'did:plc:b' },
];

describe('cookbook feed meta persistence', () => {
  it('round-trips the author set + fetchedAt, scoped per DID', () => {
    const storage = memoryStorage();
    writeFeedMeta(DID, authors, '2026-07-10T00:00:00.000Z', { storage });
    const meta = readFeedMeta(DID, { storage });
    expect(meta).toEqual({ authors, fetchedAt: '2026-07-10T00:00:00.000Z' });
    // A different DID is a different cache slot.
    expect(readFeedMeta('did:plc:other', { storage })).toBeNull();
  });

  it('returns null when nothing is cached and degrades on broken storage', () => {
    expect(readFeedMeta(DID, { storage: memoryStorage() })).toBeNull();
    const broken: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    expect(readFeedMeta(DID, { storage: broken })).toBeNull();
    expect(() => writeFeedMeta(DID, authors, '2026-07-10T00:00:00.000Z', { storage: broken })).not.toThrow();
  });
});

describe('relativeFreshness', () => {
  const base = Date.parse('2026-07-10T12:00:00.000Z');
  it('reads recent as "just now"', () => {
    expect(relativeFreshness('2026-07-10T11:59:40.000Z', base)).toBe('just now');
  });
  it('reads minutes and hours', () => {
    expect(relativeFreshness('2026-07-10T11:55:00.000Z', base)).toBe('5 min ago');
    expect(relativeFreshness('2026-07-10T09:00:00.000Z', base)).toBe('3 hr ago');
  });
  it('reads days for older content', () => {
    expect(relativeFreshness('2026-07-08T12:00:00.000Z', base)).toBe('2 days ago');
  });
});
