// Liked feed (Phase 9): load the recipes behind a viewer's `liked` interaction
// records, keyed by recipe URI (not by author — a liked recipe can live on any
// PDS). Reuses the same primitives as loadAuthorsFeed (resolveDidDoc +
// createRecordReader + cache.put) but resolves per-ref DID→PDS. Filters empty
// refs, caps discovery (logged — never a silent truncation), and skips a bad
// ref with a warning rather than blanking the whole feed.

import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { createRecordReader, RECIPE_COLLECTION } from '../recipes/read.js';
import type { Interaction } from './interactions.js';

/** Default discovery cap — matches recipe.ts COOKBOOK_DISCOVERY_CAP so the two
 *  cross-PDS fan-outs bound alike. */
export const LIKED_FEED_CAP = 50;

const parseRecipeRef = (uri: string): { did: string; rkey: string } | null => {
  const match = new RegExp(`^at://([^/]+)/${RECIPE_COLLECTION}/([^/]+)$`).exec(uri);
  return match === null ? null : { did: match[1]!, rkey: match[2]! };
};

/** Resolve a set of `liked` interactions to their recipes. */
export const loadLikedFeed = async (
  interactions: Interaction[],
  opts: { cap?: number } = {},
): Promise<CachedRecipe[]> => {
  const cap = opts.cap ?? LIKED_FEED_CAP;
  const cache = createRecipeCache();
  const read = createRecordReader();

  const allRefs = interactions.filter((i) => i.kind === 'liked').map((i) => i.recipe.uri);
  const nonEmpty = allRefs.filter((uri) => uri !== '');
  if (nonEmpty.length < allRefs.length) {
    // Empty refs (the {uri:'',cid:''} fallback) are normal filtering, not loss.
    log.debug('liked-feed', 'skipped empty recipe refs', {
      empties: allRefs.length - nonEmpty.length,
    });
  }
  const unique = [...new Set(nonEmpty)]; // a recipe liked twice shows once
  const capped = unique.slice(0, cap);
  if (capped.length < unique.length) {
    // Dropping WANTED data → must be visible (warn always emits).
    log.warn('liked-feed', 'liked set capped', {
      total: unique.length,
      loaded: capped.length,
      dropped: unique.length - capped.length,
    });
  }

  const loaded = await Promise.all(
    capped.map(async (uri): Promise<CachedRecipe | null> => {
      const ref = parseRecipeRef(uri);
      if (ref === null) {
        log.warn('liked-feed', 'unparseable recipe ref', { uri });
        return null;
      }
      try {
        const { pds } = await resolveDidDoc(ref.did); // cross-PDS: may be another PDS
        const record = await read({ pds, did: ref.did, rkey: ref.rkey });
        return await cache.put(record);
      } catch (err) {
        // One bad ref must not blank the feed — log and skip.
        log.warn('liked-feed', 'ref load failed', { uri, error: String(err) });
        return null;
      }
    }),
  );
  return loaded.filter((e): e is CachedRecipe => e !== null);
};
