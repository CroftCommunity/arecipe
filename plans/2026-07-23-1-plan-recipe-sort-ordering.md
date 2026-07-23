# Recipe sort ordering — a daily-mix default + a Sort symbol on the toolbar

**Status:** 🚧 Planned 2026-07-23, from owner mobile screenshot feedback
(index.html @ ~390px). TDD-first, red → green.

Two asks, one row:

1. **A default ordering that depends on the day.** The Browse/Cookbook feeds
   currently render in raw record order (whatever the PDS read returned). The
   ask: "whatever day it is needs a sort order." Chosen behavior (owner, via
   clarifying question): a **daily mix** — a deterministic shuffle seeded by the
   calendar day. Stable all day (so scrolling/paging doesn't reshuffle under
   you), different each day (so a 400+ recipe feed stays fresh). This is the
   *default*; any explicit sort overrides it.
2. **A "sort" symbol button on the controls row, next to Filters.** Squeeze an
   icon-only disclosure onto toolbar row 2 (the Tiles | Details · Filters ▾
   line) offering the sort fields: **Name, Date, Cuisine, Meal** — plus the
   Daily mix default at the top. Shown on **both** Browse and Cookbook (they
   share `renderToolbar`).

## Grounding (what already exists)

- **The toolbar is shared** (`src/recipes/toolbar.ts`, `renderToolbar`) by
  Browse (`src/pages/browse.ts`) and Cookbook (`src/pages/cookbook.ts`). Row 2
  is `[Tiles | Details] [Filters ▾] [reset · count]`, the count pushed right
  (`.browse-count { margin-left: auto }`). The sort control slots between
  Filters and the count block.
- **The filter/persist core** is `src/pages/browse-state.ts`: `BrowseState`
  (`view`, `photosOnly`, `facets`) + `createBrowsePrefs` (per-prefix
  localStorage). Sort rides here as a fourth `BrowseState` field so it persists
  per consumer (Browse vs Cookbook) with zero new plumbing.
- **The sort keys are already on the record.** `value.name` (name),
  `value.createdAt` (date — the record's creation stamp on the author's PDS;
  there is no separate publish date, so this is "date added/published"),
  `recipeFacets().cuisine` (cuisine), `recipeFacets().category` (meal — already
  labeled "Meal" in the Filters facet group).
- **Icons are pinned glyphs** (`src/icons.ts` + `tests/unit/icons.spec.ts`):
  geometry lives in exported constants so a change is a deliberate test edit.
  The Sort glyph follows that posture (Lucide "arrow-down-up").
- **The popover idiom** is the `.facet-dd` native `<details>` (Filters ▾). The
  Sort control reuses it — an icon summary + a radio-list panel.

## Design

### Pure model — `src/recipes/sort.ts`

`SortMode = 'default' | 'name' | 'date' | 'cuisine' | 'meal'`, with `SORT_MODES`
(ordered, `default` first) and `SORT_LABELS` (`default → 'Daily mix'`).

`sortEntries(entries, mode, { daySeed })`: pure, returns a **new** array, never
mutates. Every comparator ends with a `uri` tie-break so the order is total and
deterministic.

- `default` — daily shuffle: order by a small string hash of `daySeed + '\0' +
  uri` (FNV-1a-ish, no `Math.random`). Same seed → identical order; a new day
  (new seed) → a new order. `daySeed` defaults to `''` (stable) so the module
  is pure and testable; the page passes today's `YYYY-MM-DD`.
- `name` — `value.name` A→Z, case-insensitive locale compare; untitled/missing
  sorts last.
- `date` — `value.createdAt` newest-first; missing/invalid sorts last.
- `cuisine` — cuisine A→Z (null last), then name A→Z within.
- `meal` — category A→Z (null last), then name A→Z within.

### Persist — `browse-state.ts`

`BrowseState` gains `sort: SortMode` (default `'default'`). `createBrowsePrefs`
loads/saves it under `${prefix}-sort`, validating against `SORT_MODES` (unknown
→ default). Filter literals that build a `BrowseState` (`NO_TAB_FILTERS`, the
two `effectiveState`s) carry it through; `matchesFilter` ignores it (sort is not
a filter).

### Toolbar — the Sort disclosure

A `.facet-dd.sort-dd` after Filters ▾: summary = `sortIcon()` + ▾ (icon-only,
`aria-label`/`title` "Sort recipes"), tinted "active" when the mode ≠ default so
a non-default sort reads at a glance without opening (mirrors the Filters count
badge). Panel = a radio group (`name="sort-mode"`, `data-sort=<mode>`) of the
five modes, the active one checked; picking one fires `onSortChange` and closes
the popover (single-select, unlike the multi-select facets). New controller
surface: `onSortChange` callback + `setSort(mode)`.

### Wiring — Browse & Cookbook

Apply ordering where the shown set is computed, **after** filter + text search
and **before** version-collapse/pagination. One nuance: an active text query
returns MiniSearch relevance order; when sort is `default` we keep that
relevance order (a daily shuffle of search hits is worse than relevance), but an
explicit field sort still applies over the hits. `daySeed` = `new Date()
.toISOString().slice(0, 10)` (UTC day), read at render.

## Tests (RED first)

- `tests/unit/recipes/sort.spec.ts` — each mode's order, null-handling,
  tie-breaks, purity, and daily-shuffle determinism (same seed stable, distinct
  seeds differ).
- `tests/unit/pages/browse-state.spec.ts` — default sort, round-trip, invalid
  ignored.
- `tests/unit/icons.spec.ts` — `sortIcon` geometry pinned.
- `tests/unit/recipes/toolbar.spec.ts` — sort-dd present in the controls row
  after Filters/before count; five radios; `onSortChange`; `setSort` reflects.
- `tests/e2e/browse.spec.ts` — picking Name / Date reorders the feed (hermetic
  mixed fixture); default leaves it unshuffled-for-the-day (assert a stable
  order across two loads on a pinned day is out of scope; assert the control
  reorders instead).

## Outcome

✅ **Implemented 2026-07-23**, TDD-first red → green. Gate green: lint ·
typecheck (both tsconfigs) · **838** unit · build · **220** hermetic e2e
(browser via the CLAUDE.md `executablePath` override — env ships chromium-1194).

- New pure model `src/recipes/sort.ts` (`SortMode`, `SORT_MODES`, `SORT_LABELS`,
  `sortEntries`) with the FNV-1a day-seeded daily mix + the four field sorts,
  every comparator `uri`-tie-broken. Unit-tested in isolation.
- `BrowseState` gained `sort`; `createBrowsePrefs` persists it per prefix
  (`browse-sort` / `cookbook-sort`), validated against `SORT_MODES`.
- `sortIcon` added to `src/icons.ts` (pinned geometry) + the toolbar Sort
  disclosure (`renderToolbar` → `onSortChange`/`setSort`), styled as a
  right-anchored radio popover with an `--active` summary tint for a non-default
  order.
- Wired into Browse and Cookbook `computeShown`/`renderCurrent`: ordering runs
  after filter + text search, before version-collapse/pagination; the daily-mix
  default yields to search relevance when a query is active.
- Two `recipes.spec.ts` assertions that pinned the raw insertion order were
  rewritten to be order-independent (the daily-mix default legitimately replaces
  that order). Visual check: 390px screenshot, Sort menu open, no overflow.
