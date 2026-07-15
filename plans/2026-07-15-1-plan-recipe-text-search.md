# Full-text recipe search on Browse and Cookbook

**Status:** ✅ **Built 2026-07-15** on branch `claude/recipe-text-search-41wsk8`.
All five phases landed TDD (red → green) with the locked design below; full gate
green (lint · typecheck · unit · build · e2e). MiniSearch 7.2.0 (17.2 KB min /
5.9 KB gzipped). Browse bundle 9.1 KB → ~15 KB gzipped-delta well under the
15 KB flag. See the run summary for red-to-green evidence and [verify-in-run]
outcomes.

## Problem Statement

Browse and Cookbook filter by facets (cuisine/category/diet/photos) and free-text
handle search, but there is **no content search**. A cook looking for what to make
with feta, or "chicken lemon", or who mistypes "brocolli", gets nothing — the
facet dropdowns don't reach ingredients, instructions, or recipe text, and there
is no ranking, prefix, or typo tolerance.

We want ranked, typo-tolerant, content-aware text search over the in-memory
`CachedRecipe[]` feed on both pages: `feta` surfaces recipes whose **ingredients**
contain feta even when the title does not; `chicken lemon` means **both** terms;
`brocolli` still finds broccoli. The meals-palette name filter
(`src/recipes/meal-plan-palette.ts`) is explicitly **out of scope** — it stays as
`includes()` filtering.

## Locked design decisions

- **D1 Engine.** `minisearch` 7.2.0 — runtime dependency, ESM default export,
  BM25 ranking + per-field boosting + prefix + fuzzy in ~5.9 KB gzipped,
  zero-dependency. Heavier engines (SQLite FTS5 WASM, Orama) rejected for this
  bounded (hundreds–low-thousands) in-memory corpus.
- **D2 Indexed fields + boosts.** Per recipe, extracted defensively (missing /
  mistyped → empty string, never throws): `name` (boost 4), `ingredients` joined
  with newlines (boost 3), `text` (boost 2), `instructions` joined (boost 1),
  plus an `aux` field (boost 1) folding `versionLabel`, fun-fact texts, and the
  normalized `cuisine`/`category` so "thai" works as free text.
- **D3 Query semantics.** `combineWith: 'AND'`, `prefix: true`, `fuzzy: 0.2`.
- **D4 Ranking vs feed order.** Empty/whitespace query = identity (input order
  preserved exactly, zero MiniSearch involvement). Non-empty = filter AND
  ordering: only matches survive, in descending score order.
- **D5 Pipeline position.** Query stage runs AFTER exclusions/facets/diet/taste
  and BEFORE `collapseVersions`, so a match on any version's content surfaces its
  dish's representative (primary) card. Pagination stays last; the page offset
  resets to 0 on every query change.
- **D6 Index lifecycle.** Index the whole candidate feed; memoize on
  entries-array identity (feed reference is stable across facet toggles, so
  facet changes never rebuild). Rebuild on feed change (find, starter load,
  cookbook `update()`, source switch, liked load). No persistence.
- **D7 UI.** One `type="search"` input in the shared toolbar, both pages, testid
  `recipe-search`, placeholder `search recipes…`, debounced ~150 ms. Query is
  transient (never persisted). Reset clears it; reset visibility includes an
  active query; an active query renders `"N of M shown"`.

### Architecture

- **`src/recipes/search.ts`** (pure core): `createRecipeSearch(entries)` builds
  a MiniSearch index keyed by `uri` and returns `{ query(q): CachedRecipe[] }`
  (ranked entries mapped back from result ids; empty/whitespace q → input copy).
  `createSearchMemo(factory?)` memoizes a searcher on entries-array identity.
  `queryEntries(searcher, q, candidates)` is the composition seam: it searches
  the whole-feed index, then keeps only the facet-filtered `candidates` whose
  dish matched (siblings included so `collapseVersions` picks the primary),
  ordered by score. No DOM, no page/auth imports.
- **`browse.ts` / `cookbook.ts`**: hold transient query state, build a memoized
  searcher over the feed, run `queryEntries` between facet-filter and collapse,
  reset the page offset on query change.
- **`toolbar.ts`**: adds the search input + `onQueryChange` callback + a
  `setSearch` controller method (reset clears it).

## Phases

1. Pure core `src/recipes/search.ts` (extraction, ranking, content reach, AND,
   fuzzy/prefix, identity, lifecycle).
2. Pipeline integration — `queryEntries` composition (collapse + facets +
   memoization), wired into Browse + Cookbook.
3. Toolbar input (`recipe-search`, debounced `onQueryChange`, reset clears,
   reset visibility, offset reset).
4. E2E — hermetic routed mixed fixture on Browse + Cookbook cold-view.
5. Docs + closeout.

## Deferred (D8)

- Match highlighting from MiniSearch match metadata.
- `autoSuggest` autocomplete.
- Swapping the meals-palette filter onto this module.
- Web Worker or persisted index (revisit only if the corpus reaches tens of
  thousands).
