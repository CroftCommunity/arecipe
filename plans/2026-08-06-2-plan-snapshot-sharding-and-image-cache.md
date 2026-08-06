# Plan: shard the bundled snapshot, cache images, and make offline honest

**Date:** 2026-08-06 · **Status:** proposed

## Problem

Publishing the Wikibooks Cookbook corpus (3,695 records, 2026-08-05) landed
4,041 records in `arecipe.bsky.social` — an account already listed under `cooks`
in `snapshot-seed.json`. Nobody decided that; it fell out of publishing into an
account that was already a snapshot seed. The consequences are all measured:

**The corpus is eagerly hydrated at every boot.** `load.ts:105` skips sharded
("corpus-style") cooks at first paint and opens one shard on demand, but
hydrates single-file cooks in full. Because the corpus went into `cooks` rather
than the `corpus` slot, it is a single-file cook. Measured on a cold load of
`index.html`:

```
load event              104 ms
first cards visible   1,488 ms
snapshot requests: 6 — including a 2.21 MB corpus shard
cdn.bsky image requests: 10   (50 cards in DOM, 13 img tags)
```

So every boot downloads 2.21 MB and pushes 4,041 records through `cache.put`.

**Those writes are pathological.** `cache.ts:62` (`inStore`) opens an IndexedDB
connection, runs ONE request, and closes it — per record, awaited sequentially.
Benchmarked in headless Chromium at 4,041 records: **1.2 s** versus **0.58 s**
for a single batched transaction (~2×; phones are typically 4–6× slower). Real,
but not the dominant cost.

**Images have no service-worker cache at all.** `sw.ts:124` returns early on all
cross-origin requests, and thumbnails come from `cdn.bsky.app`
(`present.ts:71`). So images live only in the browser HTTP cache
(`max-age=604800`), are evicted at the browser's discretion — aggressive for
PWAs on iOS — and **never work offline**. `present.ts:67` already records this
as deferred to "Phase 8b offline caching," which has not happened.

**A single write invalidates the whole corpus.** Revalidation compares one rev
per repo; a changed rev refetches that cook's records via paginated
`listRecords`. All four cooks' revs currently match, so this is not firing — but
one write to the corpus account re-pages all 4,041 records for every client.

**Cookbook renders unbounded.** Browse windows to 50 (`BROWSE_PAGE_SIZE`) and
slices *before* rendering; `cookbook.ts:317` calls the same `renderRecipeList`
(`view.ts:387`, a bare `for` over every entry) without windowing. Follow the
corpus account and cookbook builds 4,041 cards.

**Precache failure is silent.** `sw.ts:52` tolerates per-asset failures so one
miss cannot brick the install — correct, but unreported. A 10 MB shard is the
likeliest asset to fail, and when it does the app refetches it live on every
boot with no signal.

Not a problem, and worth stating because it was suspected: **browse's lazy
loading already works.** 10 image requests for 50 cards. `loading="lazy"` plus
the 50-item window is doing its job.

## Approach

Keep the entire corpus bundled and precached — it must travel with the PWA — but
stop hydrating it at boot, and give images a real cache.

**D1 — corpus to the `corpus` slot, sharded by `hash(rkey) mod 16`.** The seed's
own `$comment` always intended this. `shardRecords` exists, `load.ts:105`
already skips sharded cooks, `loadRecipeShard` already opens one part. This is a
seed change plus a shard-key function.

**D2 — enrich `index.json`, and raise its ceiling 96 K → 256 K.** Sharding alone
would break browse: for a sharded cook the index carries only
`{rkey, title, shard}`, so cards would lose thumbnails and every filter facet
(dishKey, category, cuisine, diet, cookingMethod, time, yield all live in record
bodies). The index becomes the first-paint payload and must carry them.

**D3 — service-worker image cache with a PDS fallback.** Cache-first keyed by
CID, LRU-capped; on CDN failure fall back to `sync.getBlob` on the cook's PDS
before the existing placeholder (`view.ts:207`).

**D4 — window cookbook** to match browse. No prefetching until this lands.

**D5 — batch the IndexedDB writes** — one transaction per shard instead of one
connection per record.

**D6 — offline e2e coverage**, and make precache failure visible.

## Reasoning

### Why shard, and why by `hash(rkey)`

Three schemes measured over the real 4,041 records (gzipped):

| scheme | shards | median | max | one added recipe dirties | worst shard loss |
|---|---:|---:|---:|---|---:|
| fixed-250 (today's `shardRecords`) | 17 | 141 K | 157 K | **~8 of 17** | 7.0% |
| **`hash(rkey) mod 16`** | 16 | 150 K | 169 K | **exactly 1** | 7.1% |
| by `recipeCategory` | 16 | 75 K | **609 K** | exactly 1 | **27.4%** |

- **Fixed-size is rejected** because it chunks in `listRecords` order, so
  inserting one recipe shifts every downstream chunk.
- **Semantic (meal/category) is rejected** on two counts: `recipeCategory` is
  present on only 73% of records and skews badly (`_uncategorized` 1,088,
  `dessert` 772 — an 8× spread), and it fails *coherently*. Losing a shard means
  "every dessert is gone" rather than a uniform 7% scatter that leaves every
  category represented. There is no meal field; `breakfast` (137) and `dinner`
  (178) are two thin values among 15, not a partition.

**`rkey` over `dishKey`.** Balance is a wash (1.30× vs 1.29× spread).
`hash(dishKey)` co-locates variants perfectly (136/136 multi-variant dishes vs
9/136 by chance) and `dish.ts:56` really does hydrate all siblings — but the
prize is small: **only 8.2% of records share a dishKey**, 3,701 of 3,837 dishes
being a single recipe, and both shards are already in precache so it saves a
local parse, not a fetch. The deciding factor is mutability. `rkey` is
`wb-<pageid>` — the wbsync ledger is keyed on pageid precisely so a Wikibooks
rename is an update in place. `dishKey` is *derived* from the curated map
(`wb-dishkeys.approved.json`); re-deriving it moves records between shards,
dirtying two per move and doing it in bulk on a map regeneration. That directly
undercuts the update granularity this plan exists to buy. It is also 10 records
short of full coverage.

*Caveat:* the dishKey-churn argument is from how the map is built, not observed
history — the corpus has been published once. If that map proves stable,
`hash(dishKey)` becomes defensible and D1 is a one-line change.

### Why the ceiling has to move

`index.json` variants, gzipped, against the current 98,304 B gate:

| index.json content | gz | vs ceiling |
|---|---:|---|
| today: rkey + title | 56 K | OK |
| + thumbnail CID | 97 K | **over by 1 K** |
| + thumb, dishKey, category, diet | 142 K | over by 46 K |
| full facet set (9 fields) | 177 K | over by 81 K |

Adding *only* the thumbnail CID already breaches it. The ceiling was set when
`index.json` was rkey+title for a few small cooks; under D1 it becomes the
primary first-paint payload and needs a budget matching that role. Raising it
silently would defeat the gate's purpose, so it moves deliberately, with this
table as the record. Even at 177 K it is a 12× improvement on today's 2.21 MB.

### Why this does not trade away offline

Sharded still means precached — every shard stays in `__PRECACHE__`. The change
is that bodies are parsed on demand *from local cache*, not fetched from the
network. Nothing extra crosses the network offline. Bundling the whole corpus is
the deliberate choice (recipes are near-static; it saves bandwidth and makes the
PWA useful offline from first run), and this plan preserves it.

Net first paint: **2.21 MB + 4,041 IndexedDB writes → ~177 KB + zero.**

### Why LRU by CID, not TTL

Blob CIDs are content addresses: the bytes for a CID can never change. So
freshness is not a concern and a TTL would only cause needless refetches of
immutable, long-lived content. The cache needs a *size* bound, not an age one —
4,041 thumbnails is ~122 MB (271 MB at full size; the CDN transform is a
measured 2.2× mean shrink).

## Deliverables

| | Deliverable | Notes |
|---|---|---|
| D1 | Corpus in the `corpus` slot, `hash(rkey) mod 16` | `snapshot-seed.json`, `snapshot-core.mjs` |
| D2 | Enriched `index.json` + ceiling 96 K → 256 K | `snapshot-core.mjs`, `build.mjs:24` |
| D3 | SW image cache (CID cache-first, LRU) + `getBlob` fallback | `sw.ts`, `present.ts` |
| D4 | Cookbook windowing | `cookbook.ts` |
| D5 | Batched IndexedDB writes | `cache.ts`, `load.ts` |
| D6 | Offline e2e + precache-failure reporting | `tests/e2e/`, `sw.ts` |

## Testing

TDD throughout. Unit (vitest) for shard assignment, index shape, LRU eviction
and the blob-URL fallback chain; hermetic e2e for the offline flows.

Offline e2e is the gap that let the eager-load regression ship, so it is a
deliverable, not a nicety. At minimum: cold install → go offline → browse
renders cards with images; open an unopened recipe offline; and a precache miss
surfaces rather than silently refetching.

Watch every test fail first. D1 and D2 change bytes that `build.mjs` gates, so
run the full `npm run test` (Node 22 — see `.nvmrc`; on newer Node,
`cookbook-members-view.spec.ts` fails 7 tests for unrelated reasons).

## Open questions

1. **LRU bound: entry count or bytes?** Bytes is honest about the 122 MB
   ceiling; entry count is easier to reason about ("the last N recipes you
   looked at"). Unresolved.
2. **Should `getBlob` fallback be rate-limited?** It serves full-size originals
   (240 KB median stored, vs ~115 KB average through the CDN transform — a
   measured 2.2× mean shrink). Fine as a degraded path, expensive if
   the CDN has a sustained outage and every card falls through.
3. **Revalidation granularity** is out of scope here but unresolved: one write
   to the corpus account still invalidates all 4,041 records. Sharding makes a
   per-shard rev conceivable; not attempted in this plan.
