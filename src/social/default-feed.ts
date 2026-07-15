// Browse default-feed composition (D2): the default Browse feed is the merge of
// the starter-pack cooks and the cooks you've followed (the device-local
// cook-follows — the universal read model). Deduped by DID so a cook who is both
// a starter and a follow loads once; starters lead (curated), follows append.
// Pure + zero-auth so it is safe in the Browse bundle-split.

import type { FeedAuthor } from './feed.js';

/** Merge starter cooks + followed cooks into the default feed's author list,
 *  deduped by DID (first occurrence wins its handle — starters before follows). */
export const mergeCookAuthors = (
  starters: readonly FeedAuthor[],
  follows: readonly FeedAuthor[],
): FeedAuthor[] => {
  const byDid = new Map<string, FeedAuthor>();
  for (const author of [...starters, ...follows]) {
    if (!byDid.has(author.did)) byDid.set(author.did, author);
  }
  return [...byDid.values()];
};
