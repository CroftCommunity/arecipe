# Recipe-loading perf: diagnosis + the four fixes that landed

**Date:** 2026-08-11 · **Status:** done (measurements below) ·
**Branch:** `claude/recipe-loading-perf-u6aaez`

## The report

> "Recipes are taking up to 8 seconds to load on the browse page, and cookbook
> and browse on plan page is super slow. We added lots of new recipes but I
> thought we had the performance down — seeding recipes, showing results
> without loading them all, caching for rerendering and offline."

## Diagnosis (all verified against the deployed app, 2026-08-11)

The seeding/caching design is intact — but the Wikibooks corpus publish
(2026-08-05) put **4,041 records into `arecipe.bsky.social`**, which is a plain
eager cook in `snapshot-seed.json` (`corpus: null`, no `maxRecordsPerShard`).
That single fact routes the whole corpus down every path that was sized for
dozens of records. The 2026-08-06 sharding plan
(`2026-08-06-2-plan-snapshot-sharding-and-image-cache.md`) measured the same
root cause; none of its phases had been implemented yet.

Probed deployed state (build `2026.08.10-1194c93`):

- `manifest.json`: `arecipe.bsky.social` — 4,041 records, **1 shard**; that
  shard file is **10.4 MB raw** (~2.2 MB over the wire).
- Live PDS revs matched the snapshot for the corpus account, so revalidation
  thrash was NOT the cause (it costs a full 41-page refetch only when a rev
  drifts — `daffl.xyz` was one such stale cook).

Four compounding costs, per surface:

1. **Browse boot re-did the whole corpus hydration every single load.**
   `loadSnapshotFeed` fetched + `JSON.parse`d the 10.4 MB shard, then wrote
   4,041 records **serially, one IndexedDB connection + one transaction per
   record** (`cache.put` → `inStore` opens/closes per call), re-computing every
   CID each time. Measured by the 08-06 plan at 1.2 s on desktop Chromium,
   4–6× on phones — plus parse + fetch. First cards waited on all of it.
2. **The plan page's Browse palette source loaded everything LIVE, every
   visit.** `loadStarterPalette → loadStarterFeed → loadAuthorsFeed` =
   plc.directory resolve + **41 sequential `listRecords` round trips** (100
   records/page over 4,041) + a `Promise.all` of 4,041 single-record
   `cache.put`s (4,041 concurrent IndexedDB connections). No snapshot reuse at
   all. At ~100–200 ms per round trip this alone is 4–8 s.
3. **Cookbook rendered a card per record with no windowing** (Browse windows
   to 50; Cookbook called `renderRecipeList` over everything), and its
   own/member feeds go through the same per-record `cache.put` path.
4. **Every feed-array change rebuilt a full MiniSearch index over 4,041
   records eagerly** — on boot, on every progressive load, and on every
   revalidation update — even when no search query was ever typed.

## What landed (this branch)

| # | Fix | Files |
|---|---|---|
| 1 | **`cache.putMany`** — one connection + one transaction per batch, CID verify still per record (plan Phase 3, extended to the live paths) | `src/recipes/cache.ts`, `src/snapshot/load.ts`, `src/social/feed.ts`, `src/pages/browse.ts` |
| 2 | **Hydration fast path** — per-build `hydrated` marker in the snapshot store; a warm boot serves eager cooks straight from IndexedDB (one `getAll`), zero shard fetch/parse, zero CID recompute. Marker outrunning the cache heals via the shard | `src/snapshot/store.ts`, `src/snapshot/load.ts` |
| 3 | **Progressive per-cook painting** — `loadSnapshotFeed` loads cooks in parallel and reports each via `onCookLoaded`; Browse paints the small cooks immediately instead of waiting on the corpus shard | `src/snapshot/load.ts`, `src/pages/browse.ts` |
| 4 | **Snapshot-first palette** — `loadSnapshotFirstFeed` serves snapshot-covered cooks from the bundle/IndexedDB and live-loads only uncovered authors; the meal planner's Browse source uses it | `src/social/default-feed.ts`, `src/recipes/meal-plan-palette.ts` |
| 5 | **Cookbook windowing** (plan Phase 6) — `windowPage` at 50/page with pager arrows, offset resets on any filter/sort/source/query change | `src/pages/cookbook.ts`, `tests/e2e/cookbook-window.spec.ts` |
| 6 | **Lazy search index** — MiniSearch build deferred to the first non-empty query; the empty-query identity path never touches record bodies | `src/recipes/search.ts` |

## Measurements (headless Chromium, built dist, real 4,112-record snapshot)

Probe: local static server, fresh browser context; "cold" = first-ever visit
(no SW, no cache), "warm" = a later visit after hydration completed. Corpus
shard as deployed: 10.4 MB raw / ~2.2 MB wire, 4,041 records in one file.

| boot | first cards | full 4,112-recipe feed | shard fetch/parse | CID recomputes |
|---|---:|---:|---:|---:|
| cold (first ever) | **~1.5–1.6 s** (small cooks + progressive corpus) | ~3.6–3.8 s | once | 4,112 (once) |
| warm (repeat) | **~0.75 s** | ~1.7–2 s | **zero** | **zero** |

Warm-boot trace: `index.json` (SW cache) at 124 ms → corpus served from the
IndexedDB key-range read and painted at ~750 ms → small cooks merge in →
revalidation's `manifest.json` only at ~2.1 s, fully off the paint path.

Baseline for comparison: the deployed build hydrates the whole corpus before
first paint — the 08-06 plan measured 1,488 ms first-cards on desktop with the
per-record IndexedDB writes alone costing 1.2 s serial (phones 4–6× slower —
the reported "up to 8 seconds"), and it re-paid the full fetch + parse +
4,041 CID recomputes + 4,041 single-record transactions on EVERY boot. The
plan page's Browse palette was worse: 41 sequential live `listRecords` round
trips + 4,041 parallel single-record IndexedDB connections per visit; it now
rides the same snapshot/IndexedDB path as Browse (sub-second when warm).

## What this deliberately does NOT do

- **No corpus sharding (plan Phase 1) and no enriched index (Phase 2).** The
  first *ever* boot on a build still downloads and parses the one ~2.2 MB-wire
  shard — but now off the first-paint path (small cooks paint first), written
  in one transaction, and only ONCE per build thanks to the hydration marker.
  Sharding + index-driven rendering remain the plan of record; nothing here
  conflicts with them.
- **No image caching / offline phases (2B, 4, 5, 7)** — untouched, still open.
- **The `verified` trust surface is unchanged**: CID recompute still happens
  per record on first hydration; the fast path only reuses entries whose
  verdict is already stored.

## Follow-ups (not this branch)

- **Phases 1 + 2 of the 08-06 plan remain the fix for the first-ever boot**:
  sharding the corpus by `hash(rkey) mod 16` plus the enriched index would cut
  the one-time 2.2 MB wire cost from the cold path too.
- The fast path requires ONE completed hydration: a user who closes the tab
  within the first ~4 s of their first-ever visit re-hydrates next time (the
  marker is only written after its cook's batch commits). Harmless, noted so a
  probe that closes the tab early doesn't misread it as a fast-path failure.
- Each progressive `applyEntries` re-render costs ~300 ms at corpus size
  (sort + collapse + facet scan over 4k entries); four cooks → four renders.
  Fine today; batching/debouncing is the lever if more cooks join the seed.
