// D2 boot loader (RUN-BUNDLE-PRECACHE). Load index.json + shards from the
// precached bundle (same-origin, immutable, versioned by build id → cacheable
// forever), reconstruct the feed, render — no PDS network on the critical path.
//
// A corrupt or truncated snapshot must NOT blank the screen or throw: every
// loader degrades to null and logs once, so the caller falls back to live
// loading. The snapshot is a cache, never an authority.

import { log as defaultLogger, type Logger } from '../log.js';
import { createRecipeCache, type CachedRecipe, type RecipeCache } from '../recipes/cache.js';
import { indexPath, manifestPath, cookShardPath, shardFilePath } from './paths.js';
import type { SnapshotIndex, SnapshotIndexCook, SnapshotManifest, SnapshotShard } from './types.js';

type FetchFn = typeof fetch;

const fetchJson = async <T>(fetchFn: FetchFn, url: string): Promise<T> => {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
};

/** Load index.json. Returns null (and logs once) on any failure. */
export const loadSnapshotIndex = async (
  opts: { fetchFn?: FetchFn; url?: string; logger?: Logger } = {},
): Promise<SnapshotIndex | null> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const logger = opts.logger ?? defaultLogger;
  try {
    const data = await fetchJson<SnapshotIndex>(fetchFn, opts.url ?? indexPath());
    if (!Array.isArray(data.cooks)) throw new Error('index.json missing cooks[]');
    return data;
  } catch (err) {
    logger.warn('snapshot', 'index unavailable — falling back to live loading', { error: String(err) });
    return null;
  }
};

/** Load manifest.json — the revalidation baseline (per-cook rev + pds). Returns
 * null (logs once) on failure. */
export const loadSnapshotManifest = async (
  opts: { fetchFn?: FetchFn; url?: string; logger?: Logger } = {},
): Promise<SnapshotManifest | null> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const logger = opts.logger ?? defaultLogger;
  try {
    const data = await fetchJson<SnapshotManifest>(fetchFn, opts.url ?? manifestPath());
    if (!Array.isArray(data.cooks)) throw new Error('manifest.json missing cooks[]');
    return data;
  } catch (err) {
    logger.warn('snapshot', 'manifest unavailable — no rev revalidation this session', { error: String(err) });
    return null;
  }
};

/** Load one shard file. Returns null (logs once) on failure. */
export const loadCookShard = async (
  opts: { fetchFn?: FetchFn; url: string; logger?: Logger },
): Promise<SnapshotShard | null> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const logger = opts.logger ?? defaultLogger;
  try {
    return await fetchJson<SnapshotShard>(fetchFn, opts.url);
  } catch (err) {
    logger.warn('snapshot', 'shard unavailable', { url: opts.url, error: String(err) });
    return null;
  }
};

/** A cook is "sharded" (corpus-style) when its index recipes name shard files.
 * Single-file cooks resolve to one default shard path. */
const shardFilesFor = (cook: SnapshotIndexCook): string[] => {
  const named = [...new Set(cook.recipes.map((r) => r.shard).filter((s): s is string => typeof s === 'string'))];
  return named.length > 0 ? named : [];
};

export type SnapshotFeed = {
  entries: CachedRecipe[];
  authorsByDid: Record<string, string>;
  index: SnapshotIndex;
};

/**
 * Reconstruct the default feed from the snapshot with zero PDS calls. Single-file
 * cooks are loaded eagerly (full cards on first paint); sharded corpus cooks are
 * NOT eager-loaded here — first paint never loads the whole corpus (D6), their
 * recipes open a single shard on demand via loadRecipeShard. Records go through
 * cache.put so `verified` is honest (CID recompute) and the entries persist for
 * revalidation. Returns null when there is no usable snapshot so boot falls back
 * to live loading.
 */
export const loadSnapshotFeed = async (
  opts: { fetchFn?: FetchFn; cache?: RecipeCache; buildId?: string; logger?: Logger } = {},
): Promise<SnapshotFeed | null> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const cache = opts.cache ?? createRecipeCache();
  const index = await loadSnapshotIndex({ fetchFn, url: indexPath(opts.buildId), logger: opts.logger });
  if (index === null || index.cooks.length === 0) return null;

  const authorsByDid: Record<string, string> = {};
  const entries: CachedRecipe[] = [];
  for (const cook of index.cooks) {
    authorsByDid[cook.did] = cook.handle;
    const named = shardFilesFor(cook);
    if (named.length > 0) continue; // corpus cook: lazy, not eager (D6)
    const shard = await loadCookShard({ fetchFn, url: cookShardPath(cook.did, opts.buildId), logger: opts.logger });
    if (shard === null) continue;
    for (const r of shard.records) entries.push(await cache.put(r));
  }
  return { entries, authorsByDid, index };
};

/**
 * Lazily load exactly the one shard that holds a given recipe (D6): find its
 * shard file from the index, fetch only that file. For a single-file cook this
 * is the whole cook; for a sharded corpus cook it is one part.
 */
export const loadRecipeShard = async (
  opts: { fetchFn?: FetchFn; index: SnapshotIndex; did: string; rkey: string; buildId?: string; logger?: Logger },
): Promise<SnapshotShard | null> => {
  const cook = opts.index.cooks.find((c) => c.did === opts.did);
  if (cook === undefined) return null;
  const recipe = cook.recipes.find((r) => r.rkey === opts.rkey);
  const url =
    recipe?.shard !== undefined
      ? shardFilePath(recipe.shard, opts.buildId)
      : cookShardPath(opts.did, opts.buildId);
  return loadCookShard({ fetchFn: opts.fetchFn, url, logger: opts.logger });
};
