// Full-text recipe search (recipe-text-search plan). MiniSearch over the bounded
// in-memory CachedRecipe feed — hundreds, maybe low thousands, already fetched and
// IndexedDB-cached before render — so a whole-index rebuild is milliseconds and no
// persistence is warranted (D1/D6). BM25 ranking + per-field boosting + prefix +
// fuzzy in a ~6 KB gzipped zero-dependency package.
//
// This module is the pure core: no DOM, no page imports, and — per the browse
// bundle-split constraint — nothing from src/auth/. Extraction follows the repo's
// open-world posture (read.ts / model.ts): every field is read DEFENSIVELY, so a
// missing, null, or mistyped field yields the empty string rather than throwing.
//
import MiniSearch from 'minisearch';
import type { CachedRecipe } from './cache.js';
import { funFactsOf, versionLabelOf } from './model.js';
import { recipeFacets } from '../pages/browse-state.js';

/** A trimmed string, or '' for anything non-string. Never throws. */
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Join a string[] with newlines, tolerating a mistyped (non-array / non-string)
 *  value by contributing nothing — the open-world posture. */
const joinLines = (v: unknown): string =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').join('\n') : '';

/** The indexed document for one recipe. Keyed by `uri` (unique per record). The
 *  boosts (D2) live in the search options, not here; this is just the text. */
type SearchDoc = {
  uri: string;
  name: string;
  ingredients: string;
  text: string;
  instructions: string;
  aux: string;
};

/** Fold the record's extension text — version label, fun-fact texts, and the
 *  normalized cuisine/category — into one auxiliary field so e.g. "thai" matches
 *  as free text (D2). Defensive throughout. */
const auxOf = (value: Record<string, unknown>): string => {
  const facets = recipeFacets(value);
  const parts = [
    versionLabelOf(value) ?? '',
    ...funFactsOf(value).map((f) => f.text),
    facets.cuisine ?? '',
    facets.category ?? '',
  ];
  return parts.filter((p) => p !== '').join('\n');
};

const toDoc = (entry: CachedRecipe): SearchDoc => ({
  uri: entry.uri,
  name: str(entry.value['name']),
  ingredients: joinLines(entry.value['ingredients']),
  text: str(entry.value['text']),
  instructions: joinLines(entry.value['instructions']),
  aux: auxOf(entry.value),
});

const FIELDS = ['name', 'ingredients', 'text', 'instructions', 'aux'] as const;

// Per-field boosts (D2): a name hit outranks an ingredient hit outranks body
// prose outranks a bare instruction step; cuisine/category/labels ride at the
// floor so they broaden reach without dominating.
const BOOST = { name: 4, ingredients: 3, text: 2, instructions: 1, aux: 1 } as const;

/** A searcher over a fixed set of entries. `query('')` (or whitespace) is the
 *  identity: the input entries in unchanged order, zero MiniSearch involvement
 *  (D4). A non-empty query is BOTH a filter and an ordering — only matches, in
 *  descending score order. */
export type RecipeSearch = {
  query: (q: string) => CachedRecipe[];
};

export const createRecipeSearch = (entries: readonly CachedRecipe[]): RecipeSearch => {
  const mini = new MiniSearch<SearchDoc>({
    idField: 'uri',
    fields: [...FIELDS],
  });
  const byUri = new Map<string, CachedRecipe>();
  const docs: SearchDoc[] = [];
  for (const entry of entries) {
    // Last write wins on a duplicate uri (feeds shouldn't carry them, but never
    // let MiniSearch's unique-id invariant throw on a wild repo).
    if (!byUri.has(entry.uri)) docs.push(toDoc(entry));
    byUri.set(entry.uri, entry);
  }
  mini.addAll(docs);

  return {
    query: (q) => {
      if (q.trim() === '') return [...entries];
      const results = mini.search(q, {
        combineWith: 'AND',
        prefix: true,
        fuzzy: 0.2,
        boost: { ...BOOST },
      });
      const out: CachedRecipe[] = [];
      for (const r of results) {
        const entry = byUri.get(r.id as string);
        if (entry !== undefined) out.push(entry);
      }
      return out;
    },
  };
};

/** Memoize a searcher on entries-array identity (D6). The feed reference is
 *  stable across facet toggles, so those never rebuild the index; a genuine feed
 *  change (find, starter load, cookbook update/source-switch/liked-load) hands a
 *  new array and rebuilds. The factory is injectable so the rebuild can be spied. */
export const createSearchMemo = (
  factory: (entries: readonly CachedRecipe[]) => RecipeSearch = createRecipeSearch,
): ((entries: readonly CachedRecipe[]) => RecipeSearch) => {
  let lastEntries: readonly CachedRecipe[] | null = null;
  let lastSearch: RecipeSearch | null = null;
  return (entries) => {
    if (entries !== lastEntries || lastSearch === null) {
      lastEntries = entries;
      lastSearch = factory(entries);
    }
    return lastSearch;
  };
};
