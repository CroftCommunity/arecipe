// Browse default-feed composition (D2): the default Browse feed is the merge of
// the starter-pack cooks and the cooks you've followed (the device-local
// cook-follows — the universal read model). Deduped by DID so a cook who is both
// a starter and a follow loads once; starters lead (curated), follows append.
// Zero-auth so it is safe in the Browse bundle-split.

import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { loadSnapshotFeed } from '../snapshot/load.js';
import { snapshotBuildId } from '../snapshot/paths.js';
import { createSnapshotStore } from '../snapshot/store.js';
import { loadAuthorsFeed, type AuthorsFeedResult, type FeedAuthor } from './feed.js';

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

/** What loadSnapshotFeed resolves to — injectable so tests need no network. */
type SnapshotFeedLike = {
  entries: CachedRecipe[];
  authorsByDid: Record<string, string>;
  index: { cooks: { did: string; recipes: { shard?: string }[] }[] };
} | null;

export type SnapshotFirstFeed = { entries: CachedRecipe[]; authorsByDid: Record<string, string> };

/**
 * Recipe-loading perf: the default feed for consumers OUTSIDE Browse (the meal
 * planner's Browse palette source). Snapshot-covered cooks are served from the
 * precached bundle — with the per-build hydration marker underneath, a warm boot
 * reads them straight from IndexedDB — and ONLY authors the snapshot doesn't
 * cover are live-loaded. Before this, every plan-page palette load re-paged the
 * whole corpus from the PDS (41 sequential listRecords round trips at 4k
 * records) and re-wrote every record one IndexedDB connection at a time.
 *
 * Coverage means an EAGER snapshot cook (no named shard files). A future sharded
 * corpus cook falls back to live here until the enriched index (Phase 2 of the
 * 2026-08-06 sharding plan) gives its recipes a snapshot-side shape.
 */
export const loadSnapshotFirstFeed = async (
  authors: FeedAuthor[],
  deps: {
    loadSnapshot?: () => Promise<SnapshotFeedLike>;
    loadLive?: (authors: FeedAuthor[]) => Promise<AuthorsFeedResult>;
  } = {},
): Promise<SnapshotFirstFeed> => {
  const loadSnapshot =
    deps.loadSnapshot ??
    (() =>
      loadSnapshotFeed({
        cache: createRecipeCache(),
        store: createSnapshotStore({ buildId: snapshotBuildId() }),
      }));
  const loadLive = deps.loadLive ?? loadAuthorsFeed;

  const snap = await loadSnapshot().catch(() => null);
  const authorDids = new Set(authors.map((a) => a.did));
  const entries: CachedRecipe[] = [];
  const authorsByDid: Record<string, string> = {};
  const covered = new Set<string>();
  if (snap !== null) {
    for (const cook of snap.index.cooks) {
      const eager = cook.recipes.every((r) => typeof r.shard !== 'string');
      if (eager && authorDids.has(cook.did)) covered.add(cook.did);
    }
    const didOf = (e: CachedRecipe): string => e.uri.split('/')[2] ?? '';
    for (const e of snap.entries) if (covered.has(didOf(e))) entries.push(e);
    for (const did of covered) {
      const handle = snap.authorsByDid[did];
      if (handle !== undefined) authorsByDid[did] = handle;
    }
  }

  const uncovered = authors.filter((a) => !covered.has(a.did));
  if (uncovered.length > 0) {
    const live = await loadLive(uncovered);
    entries.push(...live.entries);
    Object.assign(authorsByDid, live.authorsByDid);
  }
  return { entries, authorsByDid };
};
