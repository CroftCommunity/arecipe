// Multi-author recipe feed loader (Phase 9a), extracted from starter.ts so the
// starter pack (5e) and the friends feed (9a) share one loader instead of
// duplicating it. Behavior-preserving move: the body below is the former
// loadStarterFeed verbatim, generalized only in its names. The starter suite
// (tests/unit/recipes/starter.spec.ts + tests/e2e/starter.spec.ts) is the
// regression guard for this extraction.
//
// The contract: a multi-source feed degrades on per-author failure — first
// fall back to previously cached copies (offline survival, 8b), and only
// report an author fully unavailable when nothing is cached either. Never
// blanks the feed.

import { log } from '../log.js';
import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { createRecipeReader } from '../recipes/read.js';
import { resolveDidDoc } from '../identity/did.js';

export type FeedAuthor = { handle: string; did: string };

export type AuthorsFeed = {
  entries: CachedRecipe[];
  authorsByDid: Record<string, string>;
  failedAuthors: string[];
};

export type AuthorsFeedResult = AuthorsFeed & {
  /** Authors served from the IndexedDB cache because the network failed. */
  cachedAuthors: string[];
};

/** Load the given authors' recipes, verifying + caching each. See the module
 * comment for the degrade-not-blank contract. */
export const loadAuthorsFeed = async (authors: FeedAuthor[]): Promise<AuthorsFeedResult> => {
  const cache = createRecipeCache();
  const read = createRecipeReader();
  const authorsByDid: Record<string, string> = {};
  const failedAuthors: string[] = [];
  const cachedAuthors: string[] = [];
  const cachedByDid = async (did: string): Promise<CachedRecipe[]> =>
    (await cache.list()).filter((e) => e.uri.split('/')[2] === did);

  const perAuthor = await Promise.all(
    authors.map(async (author) => {
      authorsByDid[author.did] = author.handle;
      try {
        const { pds } = await resolveDidDoc(author.did);
        const records = await read({ pds, did: author.did });
        // ONE transaction per author — per-record connections are pathological
        // at corpus size (Phase 3 of the 2026-08-06 sharding plan).
        return await cache.putMany(records);
      } catch (err) {
        const cached = await cachedByDid(author.did);
        if (cached.length > 0) {
          log.info('feed', 'author served from cache (offline)', {
            handle: author.handle,
            count: cached.length,
          });
          cachedAuthors.push(author.handle);
          return cached;
        }
        log.warn('feed', 'author feed failed', { handle: author.handle, error: String(err) });
        failedAuthors.push(author.handle);
        return [];
      }
    }),
  );
  return { entries: perAuthor.flat(), authorsByDid, failedAuthors, cachedAuthors };
};
