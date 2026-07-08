// Starter pack, lite (Phase 5e): a curated set of authors whose recipes fill
// Browse by default — toggleable in settings. Client-side-only for now; the
// forerunner of the app.arecipe.starterpack record idea (see the plan,
// Phase 9). Handles + DIDs are baked; each author's PDS is resolved fresh
// from plc.directory (the DID document is the source of truth).

import { log } from '../log.js';
import { createRecipeCache, type CachedRecipe } from './cache.js';
import { createRecipeReader } from './read.js';
import { resolveDidDoc } from '../identity/did.js';

export type StarterAuthor = { handle: string; did: string };

/** Probed live 2026-07-07 — see the plan's Phase 5e entry. First entry is
 * the official application account (general data store on its PDS). */
export const STARTER_AUTHORS: readonly StarterAuthor[] = [
  { handle: 'arecipe.bsky.social', did: 'did:plc:spfl4xaktvvchr2cqp2r2xvp' },
  { handle: 'rdur.dev', did: 'did:plc:26tsx5juuss4yealylyfbj4h' },
  { handle: 'recipe.exchange', did: 'did:plc:4cx7ts7lqgjtsfquo53qo3sz' },
  { handle: 'daffl.xyz', did: 'did:plc:vspq46f5zmrlesaszlyfliy2' },
] as const;

const STORAGE_KEY = 'starter-pack-disabled';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type StarterPrefs = {
  isEnabled: (handle: string) => boolean;
  setEnabled: (handle: string, enabled: boolean) => void;
  enabledAuthors: () => StarterAuthor[];
};

/** Prefs store disabled handles (default = everything enabled). Defensive:
 * storage failure (private mode) degrades to defaults, never crashes. */
export const createStarterPrefs = (opts: { storage?: StorageLike } = {}): StarterPrefs => {
  const storage = opts.storage ?? window.localStorage;
  const readDisabled = (): Set<string> => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return new Set(raw === null ? [] : (JSON.parse(raw) as string[]));
    } catch {
      return new Set();
    }
  };
  const writeDisabled = (disabled: Set<string>): void => {
    try {
      if (disabled.size === 0) storage.removeItem(STORAGE_KEY);
      else storage.setItem(STORAGE_KEY, JSON.stringify([...disabled]));
    } catch {
      /* private mode: toggles live for this page only */
    }
  };
  return {
    isEnabled: (handle) => !readDisabled().has(handle),
    setEnabled: (handle, enabled) => {
      const disabled = readDisabled();
      if (enabled) disabled.delete(handle);
      else disabled.add(handle);
      writeDisabled(disabled);
    },
    enabledAuthors: () => {
      const disabled = readDisabled();
      return STARTER_AUTHORS.filter((a) => !disabled.has(a.handle));
    },
  };
};

export type StarterFeed = {
  entries: CachedRecipe[];
  authorsByDid: Record<string, string>;
  failedAuthors: string[];
};

export type StarterFeedResult = StarterFeed & {
  /** Authors served from the IndexedDB cache because the network failed. */
  cachedAuthors: string[];
};

/** Load the enabled authors' recipes. A multi-source feed degrades on
 * per-author failure: first fall back to previously cached copies (offline
 * survival, 8b), and only report an author fully unavailable when nothing
 * is cached either. Never blanks the page. */
export const loadStarterFeed = async (authors: StarterAuthor[]): Promise<StarterFeedResult> => {
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
        return await Promise.all(records.map((r) => cache.put(r)));
      } catch (err) {
        const cached = await cachedByDid(author.did);
        if (cached.length > 0) {
          log.info('starter', 'author served from cache (offline)', {
            handle: author.handle,
            count: cached.length,
          });
          cachedAuthors.push(author.handle);
          return cached;
        }
        log.warn('starter', 'author feed failed', { handle: author.handle, error: String(err) });
        failedAuthors.push(author.handle);
        return [];
      }
    }),
  );
  return { entries: perAuthor.flat(), authorsByDid, failedAuthors, cachedAuthors };
};
