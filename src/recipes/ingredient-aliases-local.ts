// Ingredient corrections overlay (plans/2026-08-12-1-plan-ingredient-
// normalization-and-substitutions.md, Phase 6). The device-local knowledge
// base: when the shipped vocabulary does not know an ingredient line, the cook
// says what it IS — picking an EXISTING key, never inventing one — and from
// then on that name resolves on this device, ahead of the shipped baseline
// (overlay > baseline > unmatched, the exclusions.ts idiom).
//
// Entries are keyed on the unmatched NAME the resolver reported ("freeze-dried
// strawberry"), not the raw line: one confirmation covers every line that reads
// the same once quantity and prep come off, and a parser change that alters the
// split simply leaves an entry unconsulted — never wrong. Storage is defensive
// (private mode degrades to "nothing confirmed"). Corrections export as the
// seed-alias block for the next build review: the manual promotion path.

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'ingredient-corrections';

/** `publishedRkey` (Phase 9) marks that this device believes an
 * app.arecipe.ingredientAlias record with this name → key exists on the cook's
 * PDS under that rkey. Cleared when the name is re-confirmed to a different
 * key (the record no longer says what this row says). */
export type IngredientCorrection = { name: string; key: string; confirmedAt: string; publishedRkey?: string };

export type IngredientCorrections = {
  /** The confirmed key for an unmatched name, or undefined. */
  lookup: (name: string) => string | undefined;
  /** Record (or replace) what a name is. */
  confirm: (name: string, key: string) => void;
  remove: (name: string) => void;
  clear: () => void;
  /** Every correction, oldest first. */
  all: () => IngredientCorrection[];
  /** Phase 9: stamp the PDS rkey a name's record lives under. No-op for an
   * absent name (a marker never creates a correction). */
  markPublished: (name: string, rkey: string) => void;
  /** The seed's `seedAliases` shape: key → sorted names, keys sorted. */
  exportSeedAliases: () => Record<string, string[]>;
};

const normalizeName = (name: string): string => name.toLowerCase().replace(/\s+/g, ' ').trim();

const toEntries = (v: unknown): IngredientCorrection[] => {
  if (!Array.isArray(v)) return [];
  const out: IngredientCorrection[] = [];
  for (const x of v) {
    if (typeof x !== 'object' || x === null) continue;
    const rec = x as Record<string, unknown>;
    if (typeof rec['name'] === 'string' && typeof rec['key'] === 'string' && typeof rec['confirmedAt'] === 'string') {
      const publishedRkey = typeof rec['publishedRkey'] === 'string' ? rec['publishedRkey'] : undefined;
      out.push({ name: rec['name'], key: rec['key'], confirmedAt: rec['confirmedAt'], ...(publishedRkey !== undefined ? { publishedRkey } : {}) });
    }
  }
  return out;
};

export const createIngredientCorrections = (
  opts: { storage?: StorageLike; now?: () => string } = {},
): IngredientCorrections => {
  const storage = opts.storage ?? window.localStorage;
  const now = opts.now ?? ((): string => new Date().toISOString());
  const read = (): IngredientCorrection[] => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw === null ? [] : toEntries(JSON.parse(raw));
    } catch {
      return [];
    }
  };
  const write = (entries: IngredientCorrection[]): void => {
    try {
      if (entries.length === 0) storage.removeItem(STORAGE_KEY);
      else storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* private mode: corrections live for this page only */
    }
  };
  return {
    lookup: (name) => read().find((e) => e.name === normalizeName(name))?.key,
    confirm: (name, key) => {
      const n = normalizeName(name);
      const k = key.trim();
      if (n === '' || k === '') return;
      const prior = read().find((e) => e.name === n);
      // Same meaning again: keep the marker (the record still says this).
      const keep = prior !== undefined && prior.key === k && prior.publishedRkey !== undefined ? { publishedRkey: prior.publishedRkey } : {};
      write([...read().filter((e) => e.name !== n), { name: n, key: k, confirmedAt: now(), ...keep }]);
    },
    markPublished: (name, rkey) => {
      const n = normalizeName(name);
      const entries = read();
      if (!entries.some((e) => e.name === n && e.publishedRkey !== rkey)) return;
      write(entries.map((e) => (e.name === n ? { ...e, publishedRkey: rkey } : e)));
    },
    remove: (name) => write(read().filter((e) => e.name !== normalizeName(name))),
    clear: () => write([]),
    all: () => read(),
    exportSeedAliases: () => {
      const byKey = new Map<string, string[]>();
      for (const e of read()) byKey.set(e.key, [...(byKey.get(e.key) ?? []), e.name]);
      const out: Record<string, string[]> = {};
      for (const key of [...byKey.keys()].sort()) out[key] = [...new Set(byKey.get(key))].sort();
      return out;
    },
  };
};
