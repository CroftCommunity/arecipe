// Meal-plan palette loaders (Phase 7): turn arecipe's recipe feeds into
// placeable palette items. Two sources behind a switch — My Cookbook (your
// bounded reach) and Browse (the starter feed) — plus an add-a-cook-by-handle
// leg, reusing the same read paths Cookbook and Browse already run. Each loader
// maps feed entries to { uri, cid, name } and degrades like those pages (a
// failed source contributes nothing, never blanks the palette), logging its
// seam so a blank palette is diagnosable (source failed vs. genuinely empty).
//
// There is no dish-name free-text search: atproto has no cross-repo index
// without an AppView and arecipe ships none. Reach beyond your Cookbook is by
// starter feed + handle lookup + client-side filtering (see the plan).

import { resolveDidDoc } from '../identity/did.js';
import { createResolver } from '../identity/resolve.js';
import { log as defaultLogger, type Logger } from '../log.js';
import { createRecipeReader } from './read.js';
import { resolveCookbook, type CookbookMember, type ReachConfig } from '../social/cookbook.js';
import { loadAuthorsFeed, type FeedAuthor } from '../social/feed.js';
import { createStarterPrefs, loadStarterFeed } from './starter.js';

/** A placeable recipe: strong-ref material plus a display name. */
export type PaletteItem = { uri: string; cid: string; name: string };

/** The minimal recipe-entry shape every feed source yields. */
type Entry = { uri: string; cid: string; value: Record<string, unknown> };

/** A feed source producing recipe entries (loadAuthorsFeed's structural core). */
type FeedLoader = (authors: FeedAuthor[]) => Promise<{ entries: Entry[] }>;

const toPaletteItem = (e: Entry): PaletteItem => ({
  uri: e.uri,
  cid: e.cid,
  name: typeof e.value['name'] === 'string' ? (e.value['name'] as string) : '(untitled)',
});

// Replicated from the page-private membersToAuthors (src/pages/cookbook.ts:47)
// per the plan's Pass 3 seam correction — origin/main does not export it. When
// the recipe-cookbook-ui branch lands src/social/cookbook-members-view.ts, swap
// this local copy for the exported version (single import change).
const membersToAuthors = async (members: CookbookMember[]): Promise<FeedAuthor[]> =>
  Promise.all(
    members.map(async (m) => {
      if (m.handle !== undefined) return { handle: m.handle, did: m.did };
      try {
        const { handle } = await resolveDidDoc(m.did);
        return { handle: handle ?? m.did, did: m.did };
      } catch {
        return { handle: m.did, did: m.did };
      }
    }),
  );

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

/** My Cookbook: your bounded reach (own recipes + starters + follows/followers).
 * `you` is required for follows/followers; omit it and only starters resolve. */
export const loadCookbookPalette = async (
  args: { you?: { did: string; pds: string }; config?: ReachConfig },
  deps: {
    resolveCookbook?: (a: { you?: { did: string; pds: string }; config?: ReachConfig }) => Promise<CookbookMember[]>;
    membersToAuthors?: (m: CookbookMember[]) => Promise<FeedAuthor[]>;
    loadAuthorsFeed?: FeedLoader;
    logger?: Logger;
  } = {},
): Promise<PaletteItem[]> => {
  const resolve = deps.resolveCookbook ?? resolveCookbook;
  const toAuthors = deps.membersToAuthors ?? membersToAuthors;
  const loadFeed = deps.loadAuthorsFeed ?? loadAuthorsFeed;
  const logger = deps.logger ?? defaultLogger;
  return collect(
    'cookbook',
    async () => {
      const members = await resolve(
        args.config === undefined ? { you: args.you } : { you: args.you, config: args.config },
      );
      const authors = await toAuthors(members);
      return (await loadFeed(authors)).entries;
    },
    logger,
  );
};

/** Browse: the starter-pack feed (Browse's default corpus), public-read. */
export const loadStarterPalette = async (
  deps: { enabledAuthors?: () => FeedAuthor[]; loadStarterFeed?: FeedLoader; logger?: Logger } = {},
): Promise<PaletteItem[]> => {
  const enabled = deps.enabledAuthors ?? (() => createStarterPrefs().enabledAuthors());
  const loadFeed = deps.loadStarterFeed ?? loadStarterFeed;
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
