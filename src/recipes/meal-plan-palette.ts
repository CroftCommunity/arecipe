// Meal-plan palette loaders (Phase 7): turn arecipe's recipe feeds into
// placeable palette items. Two sources behind a switch — My Cookbook (your
// authored + liked recipes, the Cookbook page's "Both" scope) and Browse (the
// starter feed) — plus an add-a-cook-by-handle leg, reusing the same read paths
// Cookbook and Browse already run. Each loader maps feed entries to { uri, cid,
// name } and degrades like those pages (a failed source contributes nothing,
// never blanks the palette), logging its seam so a blank palette is diagnosable
// (source failed vs. genuinely empty).
//
// There is no dish-name free-text search: atproto has no cross-repo index
// without an AppView and arecipe ships none. Reach beyond your Cookbook is by
// starter feed + handle lookup + client-side filtering (see the plan).

import { createResolver } from '../identity/resolve.js';
import { recipeFacets } from '../pages/browse-state.js';
import { log as defaultLogger, type Logger } from '../log.js';
import { createRecipeReader } from './read.js';
import { loadLikedFeed as defaultLoadLikedFeed } from '../social/liked-feed.js';
import { listInteractionsFor, type Interaction } from '../social/interactions.js';
import { loadSnapshotFirstFeed } from '../social/default-feed.js';
import type { FeedAuthor } from '../social/feed.js';
import { createStarterPrefs } from './starter.js';

/** A placeable recipe: strong-ref material plus a display name, and (when known)
 *  its cuisine/category so the standing taste preference can filter the palette. */
export type PaletteItem = { uri: string; cid: string; name: string; cuisine?: string; category?: string };

/** A window over the palette for the pager: the visible slice plus the state
 * the prev/next arrows and "Showing X–Y of N" hint need. */
export type PalettePage = {
  items: PaletteItem[];
  total: number;
  /** 1-based index of the first shown item (0 when empty). */
  start: number;
  /** 1-based index of the last shown item (0 when empty). */
  end: number;
  hasPrev: boolean;
  hasNext: boolean;
};

/** Page/window the palette. A non-empty query searches the whole set by name
 * (case-insensitive) and shows every match with no paging — the type-ahead is
 * already the narrowing. Unfiltered, the set is windowed to `cap`, with prev/
 * next arrows so a browser can cycle through recipes they wouldn't know to
 * search for. A stale `offset` past the end clamps to the last page. Pure. */
export const paginatePalette = (
  all: PaletteItem[],
  opts: { query: string; cap: number; offset: number },
): PalettePage => {
  const q = opts.query.trim().toLowerCase();
  const matched = q === '' ? all : all.filter((i) => i.name.toLowerCase().includes(q));
  const total = matched.length;
  if (total === 0) {
    return { items: [], total: 0, start: 0, end: 0, hasPrev: false, hasNext: false };
  }
  if (q !== '') {
    return { items: matched, total, start: 1, end: total, hasPrev: false, hasNext: false };
  }
  const lastPageOffset = Math.floor((total - 1) / opts.cap) * opts.cap;
  const offset = Math.min(Math.max(0, opts.offset), lastPageOffset);
  const items = matched.slice(offset, offset + opts.cap);
  return {
    items,
    total,
    start: offset + 1,
    end: offset + items.length,
    hasPrev: offset > 0,
    hasNext: offset + opts.cap < total,
  };
};

/** The minimal recipe-entry shape every feed source yields. */
type Entry = { uri: string; cid: string; value: Record<string, unknown> };

/** A feed source producing recipe entries (loadAuthorsFeed's structural core). */
type FeedLoader = (authors: FeedAuthor[]) => Promise<{ entries: Entry[] }>;

const toPaletteItem = (e: Entry): PaletteItem => {
  const facets = recipeFacets(e.value);
  return {
    uri: e.uri,
    cid: e.cid,
    name: typeof e.value['name'] === 'string' ? (e.value['name'] as string) : '(untitled)',
    ...(facets.cuisine !== null ? { cuisine: facets.cuisine } : {}),
    ...(facets.category !== null ? { category: facets.category } : {}),
  };
};

// membersToAuthors is now imported from src/social/cookbook-members-view.js —
// the recipe-cookbook-ui branch merged into main and exports it (Q3 resolved).
// The Pass 3 replica was removed in the post-rebase swap.

/** Run a source, map entries → items, log success/degrade, never blank. */
const collect = async (
  source: string,
  produce: () => Promise<Entry[]>,
  logger: Logger,
): Promise<PaletteItem[]> => {
  try {
    const items = (await produce()).map(toPaletteItem);
    logger.info('meal-plan', 'palette loaded', { source, count: items.length });
    return items;
  } catch (err) {
    logger.warn('meal-plan', 'palette source failed', { source, error: String(err) });
    return [];
  }
};

/** My Cookbook: EXACTLY the Cookbook page's "Both" scope — your authored
 * recipes + your liked recipes, deduped by uri (own first). No member/reach
 * fan-out here: that corpus is Browse's job, and duplicating it made the two
 * palette sources indistinguishable. `you` is required — signed out there is
 * no cookbook, so the palette is empty (the page defaults to Browse then).
 * A liked-leg failure degrades to authored-only, never blanks the palette. */
export const loadCookbookPalette = async (
  args: { you?: { did: string; pds: string } },
  deps: {
    readRecipes?: (target: { pds: string; did: string }) => Promise<Entry[]>;
    listInteractions?: (target: { pds: string; did: string; kind: 'liked' }) => Promise<Interaction[]>;
    likedFeed?: (interactions: Interaction[]) => Promise<{ entries: Entry[] }>;
    logger?: Logger;
  } = {},
): Promise<PaletteItem[]> => {
  const logger = deps.logger ?? defaultLogger;
  const you = args.you;
  if (you === undefined) {
    logger.info('meal-plan', 'palette loaded', { source: 'cookbook', count: 0 });
    return [];
  }
  const read = deps.readRecipes ?? createRecipeReader();
  const listInteractions = deps.listInteractions ?? listInteractionsFor;
  const likedFeed = deps.likedFeed ?? defaultLoadLikedFeed;
  return collect(
    'cookbook',
    async () => {
      const own = await read({ pds: you.pds, did: you.did });
      let liked: Entry[] = [];
      try {
        liked = (await likedFeed(await listInteractions({ pds: you.pds, did: you.did, kind: 'liked' }))).entries;
      } catch (err) {
        logger.warn('meal-plan', 'liked palette leg failed — authored only', { error: String(err) });
      }
      const seen = new Set(own.map((e) => e.uri));
      return [...own, ...liked.filter((e) => !seen.has(e.uri))];
    },
    logger,
  );
};

/** Browse: the starter-pack feed (Browse's default corpus), public-read.
 * Snapshot-first (recipe-loading perf): covered cooks come from the precached
 * bundle / IndexedDB hydration — NOT a full live re-page of the corpus on every
 * plan-page visit; only snapshot-uncovered authors go to the PDS. */
export const loadStarterPalette = async (
  deps: { enabledAuthors?: () => FeedAuthor[]; loadStarterFeed?: FeedLoader; logger?: Logger } = {},
): Promise<PaletteItem[]> => {
  const enabled = deps.enabledAuthors ?? (() => createStarterPrefs().enabledAuthors());
  const loadFeed = deps.loadStarterFeed ?? loadSnapshotFirstFeed;
  const logger = deps.logger ?? defaultLogger;
  return collect('browse', async () => (await loadFeed(enabled())).entries, logger);
};

/** Add-a-cook-by-handle: Browse's by-cook "search" (resolve → read that repo). */
export const loadHandlePalette = async (
  handle: string,
  deps: {
    resolver?: (handle: string) => Promise<{ did: string; pds: string }>;
    reader?: (target: { pds: string; did: string }) => Promise<Entry[]>;
    logger?: Logger;
  } = {},
): Promise<PaletteItem[]> => {
  const resolve = deps.resolver ?? createResolver();
  const read = deps.reader ?? createRecipeReader();
  const logger = deps.logger ?? defaultLogger;
  return collect(
    'handle',
    async () => {
      const { did, pds } = await resolve(handle);
      return read({ pds, did });
    },
    logger,
  );
};
