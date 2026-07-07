// Exclusions, lite: hide specific recipes by AT-URI. The client-side
// forerunner of app.arecipe.mute.recipe (spec Layer 8 / plan Phase 10) —
// same overlay model the real mute system will use: a curated baseline the
// user can override in either direction. Storage is defensive (private
// mode degrades to the baked defaults).

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'hidden-recipes';

/** Curated baseline: known junk records hidden out of the box. */
export const HIDDEN_BY_DEFAULT: readonly string[] = [
  // daffl.xyz "Test Recipe" ("Love" / "Do the things") — flagged by the
  // maintainer 2026-07-07 as the first exclusion candidate.
  'at://did:plc:vspq46f5zmrlesaszlyfliy2/exchange.recipe.recipe/01KVQFHYF6PJP7KP84PNCJZ8K9',
] as const;

export type Exclusions = {
  isHidden: (uri: string) => boolean;
  hide: (uri: string) => void;
  unhide: (uri: string) => void;
  /** Every currently hidden URI (baked defaults + user, minus overrides). */
  all: () => string[];
};

type Overlay = { hidden: string[]; unhidden: string[] };

export const createExclusions = (opts: { storage?: StorageLike } = {}): Exclusions => {
  const storage = opts.storage ?? window.localStorage;
  const read = (): Overlay => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw === null ? { hidden: [], unhidden: [] } : (JSON.parse(raw) as Overlay);
    } catch {
      return { hidden: [], unhidden: [] };
    }
  };
  const write = (overlay: Overlay): void => {
    try {
      if (overlay.hidden.length === 0 && overlay.unhidden.length === 0) {
        storage.removeItem(STORAGE_KEY);
      } else {
        storage.setItem(STORAGE_KEY, JSON.stringify(overlay));
      }
    } catch {
      /* private mode: exclusions live for this page only */
    }
  };
  const effective = (): Set<string> => {
    const overlay = read();
    const hidden = new Set([...HIDDEN_BY_DEFAULT, ...overlay.hidden]);
    for (const uri of overlay.unhidden) hidden.delete(uri);
    return hidden;
  };
  return {
    isHidden: (uri) => effective().has(uri),
    hide: (uri) => {
      const overlay = read();
      overlay.unhidden = overlay.unhidden.filter((u) => u !== uri);
      if (!overlay.hidden.includes(uri) && !HIDDEN_BY_DEFAULT.includes(uri)) {
        overlay.hidden.push(uri);
      }
      write(overlay);
    },
    unhide: (uri) => {
      const overlay = read();
      overlay.hidden = overlay.hidden.filter((u) => u !== uri);
      if (HIDDEN_BY_DEFAULT.includes(uri) && !overlay.unhidden.includes(uri)) {
        overlay.unhidden.push(uri);
      }
      write(overlay);
    },
    all: () => [...effective()],
  };
};
