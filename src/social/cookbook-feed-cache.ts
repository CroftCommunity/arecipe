// Cookbook feed: stale-while-revalidate metadata. The recipe bodies live in the
// IndexedDB recipe cache; what's missing to paint instantly is WHICH authors are
// in the cookbook (that needs the network graph resolve). So we persist the
// last-resolved author set + a fetchedAt stamp per viewed DID: on open, the page
// renders those authors' cached recipes immediately, then revalidates in the
// background. Also the bottom "as of …" freshness phrasing. Defensive storage
// (private mode) — a failure just means no instant paint, never a throw.

import { log } from '../log.js';
import type { FeedAuthor } from './feed.js';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type FeedMeta = { authors: FeedAuthor[]; fetchedAt: string };

const keyFor = (did: string): string => `cookbook-feed:${did}`;

const storageOf = (opts: { storage?: StorageLike }): StorageLike | null => {
  if (opts.storage !== undefined) return opts.storage;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** The last-resolved feed author set + fetch time for `did`, or null. */
export const readFeedMeta = (did: string, opts: { storage?: StorageLike } = {}): FeedMeta | null => {
  const storage = storageOf(opts);
  if (storage === null) return null;
  try {
    const raw = storage.getItem(keyFor(did));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { authors?: unknown; fetchedAt?: unknown };
    if (!Array.isArray(parsed.authors) || typeof parsed.fetchedAt !== 'string') return null;
    const authors = parsed.authors.filter(
      (a): a is FeedAuthor =>
        typeof a === 'object' && a !== null && typeof (a as FeedAuthor).did === 'string',
    );
    return { authors, fetchedAt: parsed.fetchedAt };
  } catch (err) {
    log.warn('cookbook', 'feed meta read failed', { did, error: String(err) });
    return null;
  }
};

export const writeFeedMeta = (
  did: string,
  authors: FeedAuthor[],
  fetchedAt: string,
  opts: { storage?: StorageLike } = {},
): void => {
  const storage = storageOf(opts);
  if (storage === null) return;
  try {
    storage.setItem(keyFor(did), JSON.stringify({ authors, fetchedAt }));
  } catch (err) {
    log.warn('cookbook', 'feed meta write failed', { did, error: String(err) });
  }
};

/** Human "how fresh" phrase for the bottom note: "just now" / "N min ago" /
 * "N hr ago" / "N days ago". Computed at render time (no live ticking). */
export const relativeFreshness = (fetchedAtISO: string, nowMs: number): string => {
  const diffMs = nowMs - Date.parse(fetchedAtISO);
  if (Number.isNaN(diffMs) || diffMs < 45_000) return 'just now';
  const min = Math.round(diffMs / 60_000);
  if (min < 90) return `${min} min ago`;
  const hr = Math.round(diffMs / 3_600_000);
  if (hr < 36) return `${hr} hr ago`;
  const days = Math.round(diffMs / 86_400_000);
  return `${days} days ago`;
};
