// Recipe-model extensions (recipe-model-extensions plan, Phase 1). arecipe
// layers a few OPEN-WORLD fields onto the consumed exchange.recipe.recipe
// record — recipe.exchange ignores them, arecipe reads them. See
// docs/LEXICONS.md for the field registry and ownership policy.
//
// Because these fields live on a record whose extras are `unknown` (the
// open-world model in read.ts), every accessor reads DEFENSIVELY: missing,
// null, mistyped, or legacy-shaped data yields the empty/undefined result
// rather than throwing. Old records (only the required fields) read as
// "no extensions".

/** A pooled "Did you know?" fact for a dish. Pooled per dishKey, denormalized
 *  onto each version record. */
export type FunFact = { text: string; source?: string };

/** A stable slug grouping alternative versions of one dish (e.g.
 *  "chocolate-chip-cookies"). Canonical map: spike/import/dishkeys.json. */
export type DishKey = string;

/** The extension fields, normalized. `funFacts` is always an array (possibly
 *  empty); the rest are absent when the record does not carry them. */
export type RecipeExt = {
  dishKey?: DishKey;
  versionLabel?: string;
  primaryVersion: boolean;
  funFacts: FunFact[];
};

const trimmedString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

const toFunFact = (v: unknown): FunFact | undefined => {
  if (typeof v !== 'object' || v === null) return undefined;
  const text = (v as Record<string, unknown>)['text'];
  if (typeof text !== 'string' || text === '') return undefined;
  const source = (v as Record<string, unknown>)['source'];
  return typeof source === 'string' ? { text, source } : { text };
};

/** The dish's pooled facts. Reads `funFacts[]`, falling back to a legacy
 *  singular `funFact` string (import corpus + pre-migration live records). */
export const funFactsOf = (value: Record<string, unknown>): FunFact[] => {
  const raw = value['funFacts'];
  if (Array.isArray(raw)) return raw.map(toFunFact).filter((f): f is FunFact => f !== undefined);
  const legacy = trimmedString(value['funFact']);
  return legacy === undefined ? [] : [{ text: legacy }];
};

/** The grouping slug, or undefined when absent/blank/mistyped. */
export const dishKeyOf = (value: Record<string, unknown>): DishKey | undefined =>
  trimmedString(value['dishKey']);

/** How this version is distinguished within its dish group (source or method). */
export const versionLabelOf = (value: Record<string, unknown>): string | undefined =>
  trimmedString(value['versionLabel']);

/** Provenance URL of a link-imported recipe (recipe-import). Open-world
 *  extension field, read defensively: undefined when absent/blank/mistyped. */
export const sourceUrlOf = (value: Record<string, unknown>): string | undefined =>
  trimmedString(value['sourceUrl']);

/** Whether this record is the default version to show for its dishKey group.
 *  Strict: only the literal boolean `true` counts. */
export const isPrimaryVersion = (value: Record<string, unknown>): boolean =>
  value['primaryVersion'] === true;

/** All extension fields for a record, normalized in one call. */
export const extensionsOf = (value: Record<string, unknown>): RecipeExt => ({
  dishKey: dishKeyOf(value),
  versionLabel: versionLabelOf(value),
  primaryVersion: isPrimaryVersion(value),
  funFacts: funFactsOf(value),
});

/** Any carrier of a record value — a RecipeRecord, a CachedRecipe, etc. */
type ValueCarrier = { value: Record<string, unknown> };

/** Bucket records by their `dishKey`. Records without a dishKey are excluded
 *  (they aren't part of any version group). Used by the compare page + browse. */
export const groupByDishKey = <T extends ValueCarrier>(records: T[]): Map<DishKey, T[]> => {
  const groups = new Map<DishKey, T[]>();
  for (const rec of records) {
    const key = dishKeyOf(rec.value);
    if (key === undefined) continue;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [rec]);
    else bucket.push(rec);
  }
  return groups;
};

/** Every record sharing a given dishKey (the dish's versions). [] if none. */
export const siblingsOf = <T extends ValueCarrier>(dishKey: DishKey, records: T[]): T[] =>
  records.filter((rec) => dishKeyOf(rec.value) === dishKey);

/** Collapse a feed to one card per dish (Browse). Records without a dishKey each
 *  stand alone; records sharing a dishKey collapse to a single representative
 *  (the primaryVersion if marked, else the first seen), placed at the dish's
 *  first-seen position. `counts` maps a representative's uri → its version count. */
export const collapseVersions = <T extends ValueCarrier & { uri: string }>(
  records: T[],
): { representatives: T[]; counts: Record<string, number> } => {
  const groups = groupByDishKey(records);
  const repByKey = new Map<DishKey, T>();
  const counts: Record<string, number> = {};
  for (const [key, members] of groups) {
    const rep = members.find((m) => isPrimaryVersion(m.value)) ?? members[0];
    if (rep === undefined) continue;
    repByKey.set(key, rep);
    counts[rep.uri] = members.length;
  }
  const representatives: T[] = [];
  const seen = new Set<DishKey>();
  for (const rec of records) {
    const key = dishKeyOf(rec.value);
    if (key === undefined) {
      representatives.push(rec);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    const rep = repByKey.get(key);
    if (rep !== undefined) representatives.push(rep);
  }
  return { representatives, counts };
};
