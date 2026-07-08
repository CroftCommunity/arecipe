// Starter pack, lite (Phase 5e): a curated set of authors whose recipes fill
// Browse by default — toggleable in settings. Client-side-only for now; the
// forerunner of the app.arecipe.starterpack record idea (see the plan,
// Phase 9). Handles + DIDs are baked; each author's PDS is resolved fresh
// from plc.directory (the DID document is the source of truth).

import { loadAuthorsFeed, type AuthorsFeedResult, type FeedAuthor } from '../social/feed.js';

/** A starter author is just a feed author (handle + DID). */
export type StarterAuthor = FeedAuthor;

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

/** The starter feed's result shape is the generic authors-feed result. */
export type StarterFeedResult = AuthorsFeedResult;

/** Load the enabled authors' recipes. Thin alias over the shared multi-author
 * loader (src/social/feed.ts) — the starter pack and the friends feed (9a)
 * share one loader. The degrade-not-blank contract lives there. */
export const loadStarterFeed = loadAuthorsFeed;
