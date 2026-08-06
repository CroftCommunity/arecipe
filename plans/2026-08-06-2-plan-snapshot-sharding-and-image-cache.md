# Plan: shard the bundled snapshot, cache images offline, and make the gap testable

**Date:** 2026-08-06 · **Status:** planned (Pass 1+2 complete; Pass 3 pending)

## Problem Statement

Publishing the Wikibooks Cookbook corpus (3,695 records, 2026-08-05) put 4,041
records into `arecipe.bsky.social` — an account already listed under `cooks` in
`snapshot-seed.json`. Nobody decided that; it fell out of publishing into an
account that was already a snapshot seed. Everything below is measured.

**The corpus is eagerly hydrated at every boot.** `src/snapshot/load.ts:105`
skips sharded ("corpus-style") cooks at first paint and opens one shard on
demand, but hydrates single-file cooks in full. The corpus went into `cooks`,
not the `corpus` slot, so it is a single-file cook. Cold load of `index.html`,
headless Chromium:

```
load event              104 ms
first cards visible   1,488 ms
snapshot requests: 6 — including a 2.21 MB corpus shard
cdn.bsky image requests: 10   (50 cards in DOM, 13 img tags)
```

**Those writes are pathological.** `src/recipes/cache.ts:62` (`inStore`) opens an
IndexedDB connection, runs ONE request, closes it — per record, awaited
sequentially by `load.ts:106`. Benchmarked at 4,041 records: **1.2 s** vs
**0.58 s** batched (~2×; phones typically 4–6× slower).

**Images have no service-worker cache and cannot work offline.**
`src/sw.ts:124` returns early on all cross-origin requests; thumbnails come from
`cdn.bsky.app` (`src/recipes/present.ts:71`). `present.ts:67` already records
this as deferred to "Phase 8b offline caching," which never happened.

**A single write invalidates the whole corpus.** Revalidation compares one rev
per repo. All four cooks' revs currently match, so it is not firing — but one
write to the corpus account re-pages all 4,041 records for every client.

**Cookbook renders unbounded.** Browse windows to 50 (`BROWSE_PAGE_SIZE`) and
slices *before* rendering; `src/pages/cookbook.ts:317` calls the same
`renderRecipeList` (`src/recipes/view.ts:387`, a bare `for` over every entry)
without windowing.

**Precache failure is silent.** `src/sw.ts:52` tolerates per-asset failures so
one miss cannot brick the install — correct, but unreported. A 10 MB shard is
the likeliest asset to fail, and when it does the app refetches it live every
boot with no signal.

**Not a problem, stated so it is not re-litigated:** browse's lazy loading
already works — 10 image requests for 50 cards. `loading="lazy"` plus the
50-item window is doing its job. No prefetching is planned.

## Reasoning

### Keep the whole corpus bundled

Decided by the owner: the corpus should travel with the PWA to save bandwidth
and be useful offline from first run. Recipes are near-static, so heavy caching
is the right posture. This plan therefore does **not** reduce what ships — every
shard stays in `__PRECACHE__`. It changes only *when bodies are parsed*: on
demand from local cache instead of all 4,041 at boot. Nothing extra crosses the
network offline.

Net first paint: **2.21 MB + 4,041 IndexedDB writes → ~177 KB + zero.**

Rejected: a two-tier bundle that fetches bodies from the network on demand. It
would shrink the install 12.6× but breaks "open any recipe offline," which is
the point of bundling.

### Why shard, and why `hash(rkey)`

Measured over the real 4,041 records (gzipped):

| scheme | shards | median | max | one added recipe dirties | worst shard loss |
|---|---:|---:|---:|---|---:|
| fixed-250 (today's `shardRecords`) | 17 | 141 K | 157 K | **~8 of 17** | 7.0% |
| **`hash(rkey) mod 16`** | 16 | 150 K | 169 K | **exactly 1** | 7.1% |
| by `recipeCategory` | 16 | 75 K | **609 K** | exactly 1 | **27.4%** |

- **Fixed-size rejected:** chunks in `listRecords` order, so inserting one
  recipe shifts every downstream chunk.
- **Semantic (meal/category) rejected:** `recipeCategory` covers only 73% of
  records and skews badly (`_uncategorized` 1,088, `dessert` 772 — 8× spread),
  and it fails *coherently*. A lost shard means "every dessert is gone" instead
  of a uniform 7% scatter leaving every category represented. There is no meal
  field; `breakfast` (137) and `dinner` (178) are two thin values among 15.
- **`rkey` over `dishKey`:** balance is a wash (1.30× vs 1.29× spread).
  `hash(dishKey)` co-locates variants perfectly (136/136 multi-variant dishes vs
  9/136 by chance) and `src/pages/dish.ts:56` really does hydrate all siblings —
  but only **8.2% of records share a dishKey**, 3,701 of 3,837 dishes being a
  single recipe, and both shards are already precached so it saves a local
  parse, not a fetch. The decider is mutability:
  `spike/wikibooks-dishkeys/propose.mjs:46,54` derives keys via
  `normalizeDishKey(r.name)` — **dishKey is a function of the recipe name** —
  while the ledger is keyed on pageid precisely because names move
  (`RUN-WIKIBOOKS-CORPUS-SUMMARY.md`: "Ledger keyed by pageid, never title →
  renames are updates, not delete+create"). The shard key would depend on the
  very thing the system was built to survive. It is also 10 records short of
  full coverage.

  *Qualification:* the approved map is `rkey → dishKey` and human-curated, so
  keys are stable until the map is **regenerated** — a deliberate ops action,
  though regenerating after upstream renames is exactly the case that moves
  keys. This establishes a mechanism, not a rename frequency.

### Why the ceiling must move, and what it costs later

`index.json` variants, gzipped, against the current 98,304 B gate:

| index.json content | gz | vs ceiling |
|---|---:|---|
| today: rkey + title | 56 K | OK |
| + thumbnail CID | 97 K | **over by 1 K** |
| + thumb, dishKey, category, diet | 142 K | over by 46 K |
| full facet set (9 fields) | 177 K | over by 81 K |

Sharding alone would break browse: for a sharded cook the index carries only
`{rkey, title, shard}`, so cards would lose thumbnails and every filter facet.
The enriched index is what makes sharding viable, and adding *only* the
thumbnail CID already breaches the gate.

**The ceiling is a cap on how large a corpus the app can bundle at all.** Unlike
shards, `index.json` cannot be deferred — it must be fully loaded at first paint
to render the grid and filters, so it is an unavoidable O(corpus) cost. At a
measured **45 B/record gz**:

| ceiling | holds | headroom from today's 4,041 |
|---|---:|---:|
| 96 K (current) | ~2,189 | **−1,852** (already over) |
| **256 K (chosen)** | **~5,839** | **+1,798** |
| 512 K | ~11,679 | +7,638 |

256 K is chosen because the Wikibooks corpus is fully captured and no second
corpus is planned. It buys room for the corpus we have, not a general answer.

**Paging trigger (documented so the next person meets a decision, not a surprise
build failure):** at ~5,800 records `index.json` hits 256 K again, and trimming
will not save it — **24% of the index (43 K) is thumbnail CIDs**, base32 hashes
that are near-incompressible unlike the titles and repeated facets around them.
Past that point the only lever is **paging the index itself** (browse loads
index parts as it pages), an architectural change affecting cross-corpus search
and filtering. Do not simply raise the number again without re-reading this.

### Why images must be cached from the PDS, not the CDN

This inverts the obvious design and is the single most important finding.
`cdn.bsky.app` sends **no CORS headers**, so a service-worker fetch of an image
yields an **opaque** response. Browsers pad opaque cache entries to frustrate
size-probing. Measured in headless Chromium via `navigator.storage.estimate()`
over 20 real thumbnails:

| source | CORS | storage per entry | extrapolated to 1,057 thumbs |
|---|---|---:|---:|
| `cdn.bsky.app` (opaque) | none | **7.04 MB** | **7.4 GB** |
| PDS `getBlob` | `ACAO: *` | 0.17 MB (actual bytes) | 176 MB |

**42× padding overhead.** Caching the CDN is infeasible — a few hundred images
would exhaust the origin quota. Opaque responses also report `status: 0`, so the
SW cannot distinguish success from failure, which breaks the fallback logic.

Only the PDS path is cacheable. It costs 2.2× the bytes (341 KB vs 146 KB
sampled; 240 KB median stored vs ~115 KB via the CDN transform) because
`getBlob` serves the full-size original.

So the two sources are used for what each is good at: **CDN for online display**
(fast, small, `max-age=604800` in the browser HTTP cache, no quota cost) and
**PDS for offline durability** (CORS-clean, inspectable, cacheable). See Open
Question 1 — the exact split is the one BLOCKING decision left.

### Why LRU by bytes, not TTL

Blob CIDs are content addresses: the bytes for a CID can never change. Freshness
is not a concern and a TTL would only force needless refetches of immutable,
long-lived content. The cache needs a *size* bound. Bytes rather than entry
count because the quota is what actually runs out (176 MB for the full set).

### Why rate limiting is adaptive, not hardcoded

Verified against docs.bsky.app: overall API requests are **3,000 per 5 minutes,
keyed by IP** — not per account. Generous for one user browsing 50 cards, but an
IP-keyed budget is *shared* by everyone behind one egress: office NAT, café
wifi, mobile carrier CGNAT. If `getBlob` becomes the caching path (not just a
fallback), every cache miss hits the PDS, making this materially more likely to
bite. Design target: honour `429`/`Retry-After`, exponential backoff, modest
concurrency, placeholder as terminal state.

`src/retry.ts` (`retryOnce`) is insufficient — two attempts, fixed delay, no
`429` awareness. wbsync's `RateLimiter` cannot be imported: O1 isolation forbids
`src/` importing from `tools/` (`tools/wikibooks/tests/o1-isolation.test.ts`
enforces it). A new limiter belongs in `src/`.

## Verified Assumptions

| Assumption | How verified |
|---|---|
| Corpus is a single-file (eager) cook | `snapshot-seed.json` lists `did:plc:spfl4…` under `cooks`; `corpus: null` |
| Sharded cooks skip eager load | `src/snapshot/load.ts:105` — `if (named.length > 0) continue` |
| Sharded index carries only rkey/title/shard | `src/snapshot/types.ts:9-15`; `loadRecipeShard` at `load.ts:117` |
| SW ignores cross-origin | `src/sw.ts:124` |
| SW precache failure is silent | `src/sw.ts:44-58`, per-asset `try/catch` |
| `inStore` opens/closes per call | `src/recipes/cache.ts:62-76` |
| CID recompute is NOT the bottleneck | benchmarked: 95 ms for 4,041 records |
| IDB batching gain | measured 1.2 s → 0.58 s (~2×), headless Chromium |
| Cold-load shape | Playwright: 104 ms load, 1,488 ms first cards, 2.21 MB shard, 10 image requests |
| cdn.bsky.app sends no CORS | probe: `access-control-allow-origin: None` |
| PDS getBlob sends `ACAO: *` | probe against `phellinus.us-west.host.bsky.network` |
| Opaque padding ≈ 7 MB/entry | `navigator.storage.estimate()` over 20 real thumbnails, 42× vs CORS |
| CDN cache headers | `cache-control: max-age=604800, public` |
| Bluesky limits: 3,000/5 min per **IP** | docs.bsky.app rate-limits page |
| Browse already lazy + windowed | `browse.ts:110,322`; `view.ts:206` sets `loading="lazy"` |
| Cookbook is NOT windowed | `cookbook.ts:317` → `view.ts:387` bare `for` |
| dishKey is name-derived | `spike/wikibooks-dishkeys/propose.mjs:46,54` |
| croft-pwa shares the cross-origin gap | `croft-pwa/src/sw-nav.ts:26` — `return 'skip'` for cross-origin |
| croft-pwa has no offline tests | grep of `croft-pwa/tests/` for `setOffline`/`offline` — no matches |

**Unverified / explicitly not claimed:** how often Wikibooks renames pages;
whether the 7 MB opaque padding figure holds on Safari/iOS (measured on
Chromium only — see Open Question 3).

## Documentation Impact

- `docs/PREVIEWS.md` — no change (grepped `snapshot`, `index.json`: no hits).
- `CLAUDE.md` — Phase 2 adds a line on the snapshot ceiling and where the
  paging trigger is documented. Existing gate/Node sections unaffected.
- `RUN-BUNDLE-PRECACHE` references in `scripts/build.mjs:24,261-262` and
  `src/snapshot/*.ts` header comments — Phases 1–2 update the comments that
  describe eager vs sharded behaviour, since the corpus changes category.
- `docs/LEXICONS.md` — no change; record shapes are untouched.
- `snapshot-seed.json` `$comment` — Phase 1 rewrites it; it currently says the
  corpus block is "the future Wikibooks tenant," which becomes false.
- `croft-pwa` docs — Phase 8 output only; no edits to croft-pwa in this plan.
- Grepped for `BROWSE_PAGE_SIZE`, `renderRecipeList`, `thumbUrl` — all
  references are in-code and covered by their phases.

## Concurrency Map

```
Sequential spine: Phase 1 → Phase 2 → Phase 2B → [Phase 3 || Phase 4 → Phase 5] → Phase 6 → Phase 7 → Phase 8
```

Phase 2B is sequential after Phase 2 (it needs the thumb CIDs the enriched index
carries) and before Phase 4 (the SW must know which images are same-origin
bundled versus PDS-cached). It shares `scripts/build.mjs` with Phase 2, so the
two cannot be parallel.

**Parallel set {3, 4→5}:** Phase 3 (IndexedDB batching) is independent of the
image-caching chain (4 then 5).

- **Disjoint write-sets:** Phase 3 writes `src/recipes/cache.ts`,
  `src/snapshot/load.ts`, `tests/unit/recipes/cache.spec.ts`. Phases 4–5 write
  `src/sw.ts`, `src/net/blob-source.ts`, `src/recipes/present.ts`,
  `src/recipes/view.ts` and their tests. No overlap.
- **Shared-state contract:** Both run in git worktrees off the feature branch.
  Neither invokes `git checkout`/`stash`/`rebase` in the parent worktree.
  Neither binds a port or starts a daemon. Both use `$TMPDIR/<phase-id>/` for
  scratch. Neither writes `dist/` (build is per-phase verification only, and
  `dist/` is gitignored).
- **Re-entry verification:** parent-repo `HEAD` equals the pre-dispatch SHA;
  `git status` clean in the main worktree; `git worktree list` shows only the
  expected entries; no orphaned `node`/`playwright` processes.

Phases 1→2 are strictly sequential (2 consumes the shard layout 1 defines).
Phase 5 depends on 4 (the limiter is called from the SW path 4 introduces).
Phases 6, 7, 8 are sequential at the tail: 7's offline tests assert behaviour
from 1–6, and 8 audits against the finished outcome.

## Phases

### Phase 1: Corpus into the `corpus` slot, sharded by `hash(rkey) mod 16`

**Goal:** The corpus stops being an eagerly-hydrated single-file cook.
**Changes:**
- [ ] `scripts/lib/snapshot-core.mjs` — add `shardKeyFor(rkey, n)` (sha256 →
      mod n) and use it in place of positional chunking when a cook declares
      sharding.
- [ ] `snapshot-seed.json` — move `did:plc:spfl4…` from `cooks` into `corpus`
      with the shard count; rewrite the now-false `$comment`.
- [ ] `scripts/lib/snapshot-core.test.mjs` — shard assignment is deterministic,
      balanced, and stable when a record is added.

**Call chain:** CI `node scripts/snapshot.mjs` → `snapshotCook()` →
`shardRecords`/`shardKeyFor` → `.snapshot-staging/cooks/<did>.<part>.json` →
`build.mjs emitSnapshot()` → `dist/assets/snapshot/<buildId>/` → SW precache →
`load.ts:105` sees `recipe.shard` set and skips eager hydration.
**Wiring test:** a test that runs the real `snapshot.mjs` capture against a
fixture repo and asserts the emitted index marks recipes with `shard` files —
i.e. that `shardFilesFor()` classifies the corpus cook as sharded. Component
tests on `shardKeyFor` alone would not prove the corpus actually changes
category.
**Depends on:** nothing.
**Read-set:** `scripts/snapshot.mjs`, `src/snapshot/load.ts`,
`src/snapshot/types.ts`.
**Write-set:** `scripts/lib/snapshot-core.mjs`, `snapshot-seed.json`,
`scripts/lib/snapshot-core.test.mjs`.
**Shared-state contract:** No shared mutable state beyond the write-set. Does
not touch git, ports, or env.
**Risks:** `shardFilesFor()` (`load.ts:71`) infers "sharded" from index entries
naming shard files — if the emitted index omits `shard`, the corpus silently
stays eager and every later phase's benefit evaporates. The wiring test exists
for exactly this.
**Done when:**
1. **Behavioral:** A built `dist/` has the corpus split across 16
   `cooks/<did>.<n>.json` files, and its index entries name their shard, so
   first paint no longer downloads a 2.21 MB single shard.
2. **Verification:** `node scripts/snapshot.mjs && npm run build` then assert
   the shard file count and that `loadSnapshotFeed` skips the corpus —
   `npx vitest run tests/unit/snapshot/`.

**Validation:** Moderate. Tests plus a real build, then re-run the cold-load
probe and confirm the 2.21 MB request is gone.

---

### Phase 2: Enriched `index.json` and a deliberate ceiling raise

**Goal:** Browse renders full cards and filters from the index alone.
**Changes:**
- [ ] `scripts/lib/snapshot-core.mjs` — `indexCook.recipes` carries thumb CID,
      dishKey, category, cuisine, diet, cookingMethod, totalTime, recipeYield.
- [ ] `scripts/build.mjs:30` — `SNAPSHOT_INDEX_GZIP_CEILING` `96 * 1024` →
      `256 * 1024`, with the paging-trigger rationale in the comment above it
      (lines 24-29), pointing at this plan. Note it stays **env-overridable**
      (`build.mjs:298` reads `process.env.SNAPSHOT_INDEX_GZIP_CEILING`), which
      is how `tests/unit/snapshot/build-presence.spec.ts` drives the real build
      with a 1-byte ceiling to prove the gate fires — that override must keep
      working, so raise the default, don't hardcode past it.
- [ ] `tests/unit/snapshot/index-shape.spec.ts` — index entries carry the facet
      set; the ceiling check still fails when genuinely exceeded.

**Call chain:** `snapshot-core.mjs` builds `indexCook.recipes` → `index.json` →
`loadSnapshotIndex` (`load.ts:23`) → browse renders cards from index entries for
sharded cooks.
**Wiring test:** an e2e that loads browse with a sharded corpus fixture and
asserts cards show **thumbnails and respond to a diet filter** — proving the
facets reached the UI, not merely that the index file contains them.
**Depends on:** Phase 1.
**Read-set:** `src/snapshot/load.ts`, `src/snapshot/types.ts`,
`src/pages/browse.ts`, `src/recipes/view.ts`.
**Write-set:** `scripts/lib/snapshot-core.mjs`, `scripts/build.mjs`,
`tests/unit/snapshot/index-shape.spec.ts`.
**Shared-state contract:** No shared mutable state beyond the write-set.
**Risks:** Browse currently renders cards from full `CachedRecipe` objects; a
sharded cook supplies index entries instead. If the card renderer cannot accept
the leaner shape, this phase grows a `view.ts` change — watch for it and split
rather than absorb (4-file rule).
**Done when:**
1. **Behavioral:** With the corpus sharded, browse shows 50 cards *with
   thumbnails*, and diet/category filters work, without loading any shard.
2. **Verification:** `npx playwright test tests/e2e/browse-sharded.spec.ts`
   plus `npm run build` succeeding at the new ceiling.

**Validation:** Moderate-to-broad. Tests, a real build, and a manual browse
pass confirming cards and filters look right.

---

### Phase 2B: Bundle a stable thumbnail subset as same-origin assets

**Goal:** A fresh install is visually complete offline, without opaque-response
padding.
**Changes:**
- [ ] `scripts/snapshot.mjs` — fetch the CDN rendition for a **stable** selected
      subset at build time (server-side, so no CORS constraint) into
      `.snapshot-staging/thumbs/<cid>.jpg`.
- [ ] `scripts/build.mjs` — emit them under the versioned snapshot path and add
      them to `__PRECACHE__`.
- [ ] `scripts/lib/snapshot-core.test.mjs` — subset selection is deterministic
      across builds and independent of the calendar day.

**Call chain:** CI `snapshot.mjs` → build-time CDN fetch → staging → `build.mjs`
→ `dist/assets/snapshot/<buildId>/thumbs/` → SW precache → `<img>` resolves
same-origin, no CORS, no padding.
**Wiring test:** offline e2e — fresh install, go offline, first browse page
shows **real images**, not placeholders. Asserting the files exist in `dist/`
would not prove the app actually resolves to them.
**Depends on:** Phase 2 (index carries thumb CIDs); Open Question — the iOS
precache answer sets the subset size.
**Read-set:** `scripts/snapshot.mjs`, `scripts/build.mjs`,
`src/recipes/present.ts`, `src/pages/browse.ts`.
**Write-set:** `scripts/snapshot.mjs`, `scripts/build.mjs`,
`scripts/lib/snapshot-core.test.mjs`.
**Shared-state contract:** Build-time only; network reads from the CDN during
CI. No git, port, or env mutation. Writes only under `.snapshot-staging/`.
**Risks:**
- **Browse's feed rotates daily** (`browse.ts:190` seeds the mix on the UTC
  calendar day), so "the first page's worth" is not a fixed set. Selection must
  be a stable rule, and offline the mix may need to prefer bundled CIDs — else
  the bundled subset and the displayed page drift apart and the whole phase
  buys nothing.
- At ~115 KB per CDN thumbnail, 100 images ≈ 11.5 MB and 200 ≈ 23 MB added to
  **every** install, against today's ~2.3 MB snapshot. Check whether a smaller
  CDN rendition exists before fixing the count — do not assume one does.
**Done when:**
1. **Behavioral:** A fresh install, taken offline before any browsing, shows
   real images on the first browse page.
2. **Verification:** `npx playwright test tests/e2e/offline-first-run.spec.ts`.

**Validation:** Broad. Tests, plus a real-device iOS check that the precache
survives (the gating question above).

---

### Phase 3: Batch the IndexedDB writes

**Goal:** Hydrating a cook stops costing one DB connection per record.
**Changes:**
- [ ] `src/recipes/cache.ts` — add `putMany(records)` using one connection and
      one transaction; keep `put` for single writes.
- [ ] `src/snapshot/load.ts` — replace the per-record `await cache.put` loop
      (line 106) with a single `putMany` per shard.
- [ ] `src/pages/browse.ts` — **line 703** does the same per-record `cache.put`
      on the *revalidation* path (`onChanged`). Found while tracing Q4; batching
      only `load.ts` would leave the pathology live on exactly the path that
      hurts most — a rev change re-writes all 4,041 records one connection at a
      time.
- [ ] `tests/unit/recipes/cache.spec.ts` — `putMany` verifies every CID, marks
      mismatches unverified, and writes all records in one transaction.

**Call chain:** `loadSnapshotFeed` → `cache.putMany(shard.records)` →
`inStore`-equivalent single transaction → IndexedDB.
**Wiring test:** a test that drives `loadSnapshotFeed` with a multi-record
fixture and asserts every record is retrievable afterwards — proving the loader
uses the batched path, not just that `putMany` works.
**Depends on:** nothing (parallel-safe with Phases 4–5).
**Read-set:** `src/snapshot/load.ts`, `src/recipes/cache.ts`.
**Write-set:** `src/recipes/cache.ts`, `src/snapshot/load.ts`,
`src/pages/browse.ts`, `tests/unit/recipes/cache.spec.ts`.
**Shared-state contract:** Runs in a worktree off the feature branch. Does not
invoke `git checkout`/`stash`/`rebase` in the parent worktree, binds no ports,
scratch under `$TMPDIR/phase3/`. Tests use a per-test IndexedDB name so parallel
runs cannot collide.
**Re-entry verification:** parent `HEAD` == pre-dispatch SHA; `git status` clean
in main worktree; `git worktree list` shows only expected entries; no orphaned
node processes.
**Risks:** CID verification must stay per-record — batching writes must not
batch away the `verified` flag, which is a trust-surface property
(`cache.ts:2-5`).
**Done when:**
1. **Behavioral:** Loading a cook's shard writes all its records in one
   transaction, with `verified` still correct per record.
2. **Verification:** `npx vitest run tests/unit/recipes/cache.spec.ts` and the
   loader wiring test.

**Validation:** Narrow-to-moderate. Tests, plus re-run the IDB benchmark to
confirm the improvement is real rather than assumed.

---

### Phase 4: Service-worker image cache (PDS-sourced, CORS-clean, LRU by bytes)

**Goal:** Images survive offline and eviction, without blowing storage quota.
**Changes:**
- [ ] `src/sw.ts` — stop blanket-skipping cross-origin; route blob requests to
      a cache-first handler keyed by CID, with LRU eviction by bytes.
- [ ] `tests/unit/sw-image-cache.spec.ts` — cache-first hit/miss, LRU evicts
      oldest by byte budget, non-blob cross-origin still skipped.

**Call chain:** `<img src>` → SW `fetch` handler → CID-keyed cache lookup → hit
returns cached, miss fetches from the PDS (CORS) and stores.
**Wiring test:** an offline e2e — load browse online, go offline, reload, assert
card images still render. Unit tests on the LRU alone would not prove the SW
actually intercepts image requests.
**Depends on:** Open Question 1 (display/cache source split) must be resolved.
**Read-set:** `src/sw.ts`, `src/sw-nav.ts`, `src/recipes/present.ts`.
**Write-set:** `src/sw.ts`, `tests/unit/sw-image-cache.spec.ts`.
**Shared-state contract:** Runs in a worktree off the feature branch. Same git
invariants as Phase 3; scratch under `$TMPDIR/phase4/`. Tests must use a
distinct Cache Storage name so parallel runs do not share cache state.
**Re-entry verification:** as Phase 3.
**Risks:** **Never cache opaque responses** — measured at 7.04 MB of quota per
entry, 42× the real bytes. Any code path that stores a `no-cors` fetch is a
defect this phase must actively prevent, with a test asserting it.
**Done when:**
1. **Behavioral:** After browsing online, going offline and reloading still
   shows card images.
2. **Verification:** `npx playwright test tests/e2e/offline-images.spec.ts`.

**Validation:** Broad. Tests, plus a manual offline pass, plus checking
`navigator.storage.estimate()` to confirm real usage tracks actual bytes and
not a padded figure.

---

### Phase 5: Adaptive rate limiter for the PDS blob path

**Goal:** The PDS path degrades gracefully instead of tripping an IP-shared
budget.
**Changes:**
- [ ] `src/net/blob-source.ts` — new: adaptive limiter honouring
      `429`/`Retry-After` with exponential backoff and bounded concurrency.
- [ ] `src/recipes/present.ts` — blob URL resolution for CDN vs PDS per the
      Open Question 1 decision.
- [ ] `tests/unit/net/blob-source.spec.ts` — backs off on 429, honours
      `Retry-After`, recovers on success, caps concurrency.

**Call chain:** SW image handler (Phase 4) → `blob-source` → throttled
`getBlob` → cache.
**Wiring test:** a test driving the SW image path against a stub PDS returning
`429` once, asserting the image still resolves after backoff rather than
falling straight to the placeholder.
**Depends on:** Phase 4; Open Question 1.
**Read-set:** `src/sw.ts`, `src/retry.ts`, `src/recipes/view.ts`.
**Write-set:** `src/net/blob-source.ts`, `src/recipes/present.ts`,
`tests/unit/net/blob-source.spec.ts`.
**Shared-state contract:** as Phase 4.
**Risks:** Must not import from `tools/` — O1 isolation
(`tools/wikibooks/tests/o1-isolation.test.ts`) fails the build if it does.
**Done when:**
1. **Behavioral:** With the PDS returning 429, images resolve after backoff and
   the app never floods the endpoint.
2. **Verification:** `npx vitest run tests/unit/net/blob-source.spec.ts` plus
   the wiring test.

**Validation:** Moderate. Tests plus a throttled-network manual pass.

---

### Phase 6: Window the cookbook list

**Goal:** Cookbook stops building a card per record.
**Changes:**
- [ ] `src/pages/cookbook.ts` — window with `windowPage` as browse does
      (`browse.ts:322`), same page size and arrows.
- [ ] `tests/e2e/cookbook-window.spec.ts` — a large cookbook renders one page,
      not every entry.

**Call chain:** `cookbook.ts` render → `windowPage(entries, …)` →
`renderRecipeList` with a windowed slice.
**Wiring test:** the e2e above — asserts the DOM card count is capped with a
large fixture, proving the windowing is wired, not merely available.
**Depends on:** nothing functionally; sequenced after 3–5 to keep the diff
readable.
**Read-set:** `src/pages/browse.ts`, `src/recipes/paginate.ts`,
`src/recipes/view.ts`.
**Write-set:** `src/pages/cookbook.ts`, `tests/e2e/cookbook-window.spec.ts`.
**Shared-state contract:** No shared mutable state beyond the write-set.
**Risks:** Cookbook has its own sort/filter state (`cookbook.ts:290`); windowing
must apply after sorting, or paging will scramble order.
**Done when:**
1. **Behavioral:** A cookbook with 4,000 entries renders one page of cards with
   working arrows.
2. **Verification:** `npx playwright test tests/e2e/cookbook-window.spec.ts`.

**Validation:** Narrow. Tests plus a manual look at a large cookbook.

---

### Phase 7: Offline e2e coverage and precache-failure visibility

**Goal:** The offline promise becomes testable, and silent precache failure
stops being silent.
**Changes:**
- [ ] `tests/e2e/offline.spec.ts` — install, go offline, browse renders cards
      with images; open a never-opened recipe offline and it renders.
- [ ] `src/sw.ts` — report precache failures (count + first failing asset) via
      an existing log path rather than swallowing them.

**Call chain:** SW `install` → per-asset `cache.add` → failure recorded →
surfaced to the page/log.
**Wiring test:** `offline.spec.ts` itself is the wiring test for the whole plan
— it exercises the real entry point with the network cut.
**Depends on:** Phases 1–6.
**Read-set:** all phases' outputs.
**Write-set:** `tests/e2e/offline.spec.ts`, `src/sw.ts`.
**Shared-state contract:** Playwright contexts are isolated; no shared state
beyond the write-set. Must not run in parallel with Phase 4 (both write
`src/sw.ts`) — hence sequential placement.
**Risks:** This is the gap that let the eager-load path ship. If it is deferred
or trimmed, the plan has not actually fixed the class of problem, only this
instance.
**Done when:**
1. **Behavioral:** With the network disabled, browse renders cards with images
   and a previously-unopened recipe opens.
2. **Verification:** `npx playwright test tests/e2e/offline.spec.ts`.

**Validation:** Broad. Tests plus a manual airplane-mode pass on a real device
if available — the desktop harness cannot fully model iOS eviction.

---

### Phase 8: Audit croft-pwa against these findings

**Goal:** Check whether the sibling PWA carries the same latent gaps, and report
— no code changes here.
**Changes:**
- [ ] Write `croft-pwa`-side findings to a plan doc **in that repo**
      (per the workspace rule that repo content lives in its repo).

**Grounded starting points (already verified):**
- `croft-pwa/src/sw-nav.ts:26` returns `'skip'` for cross-origin — the **same**
  gap as `arecipe/src/sw.ts:124`. Whether it *matters* depends on whether
  croft-pwa fetches cacheable cross-origin assets; it references
  `public.api.bsky.app` and `plc.directory` at runtime (API calls, not images).
- No offline coverage: grep of `croft-pwa/tests/` for `setOffline`/`offline`
  returned nothing, while `tests/e2e`, `unit`, `live`, `ext` all exist.
- Check whether croft-pwa precaches with the same silent per-asset tolerance.
- Check whether it has any O(corpus) first-paint payload with a size gate.

**Call chain:** n/a — audit only.
**Wiring test:** n/a. This phase produces a document, not behaviour. Its
"done" is a written finding per checklist item, each with a file:line or a
recorded probe.
**Depends on:** Phases 1–7 (audits against the finished outcome, so the
lessons are concrete rather than predicted).
**Read-set:** `croft-pwa/src/sw.ts`, `croft-pwa/src/sw-nav.ts`,
`croft-pwa/tests/`, `croft-pwa/scripts/`.
**Write-set:** a new plan doc under `croft-pwa/plans/`.
**Shared-state contract:** Read-only against croft-pwa's working tree. Does
**not** create branches, commit, or check out anything in that repo — it is a
separate repo with its own history. Writes exactly one new file.
**Risks:** Scope creep into fixing croft-pwa. This phase reports; any fix is a
separate plan in that repo.
**Done when:**
1. **Behavioral:** A reviewer can read the croft-pwa findings doc and know, per
   item, whether each arecipe lesson applies there, with evidence.
2. **Verification:** the doc exists, and every checklist item above has either
   a file:line citation or a recorded probe result.

**Validation:** Narrow. Peer-readable evidence per claim.

## Open Questions

All four walked through with the owner on 2026-08-06; none remain open.

- **[RESOLVED] Which source displays images, which populates the offline
  cache?** → **C for a bounded set + A for the rest.** Bundle a stable subset of
  thumbnails as same-origin build assets (Phase 2B) so a fresh install is
  visually complete offline; display the rest from the CDN uncached, and let the
  PDS-backed SW cache fill in as the user browses. Options A and B alone were
  rejected because both leave a fresh offline install showing 4,041 recipes with
  placeholder art, which defeats the stated goal.
- **[CONFIRMED: PHASE-GATED (Phase 4)] Image LRU budget** → **50 MB with LRU
  eviction, plus `QuotaExceededError` handling as a backstop.** Browsers grant a
  fraction of free disk rather than a fixed quota, so a self-imposed cap sits
  under an unpredictable one; the cache must degrade rather than assume the cap
  holds.
- **[REPLACED — was: does 7 MB opaque padding hold on iOS?]** Retired: the plan
  never caches opaque responses, so the figure informs no remaining decision.
  Swapped for **[CONFIRMED: PHASE-GATED (Phase 2B)] Does the bundled-thumbnail
  precache survive on a real iOS device, and is partial failure reported rather
  than silent?** iOS has the tightest quota and most aggressive eviction, and
  `sw.ts:52` currently fails silently — bundling 23 MB that iOS quietly drops is
  worse than bundling 6 MB that sticks. The subset size depends on the answer.
- **[PROMOTED to its own plan] Revalidation granularity.** Phase 0 discovery was
  executed 2026-08-06 and confirmed `com.atproto.sync.getRepo?since=<rev>` is
  the right primitive (59 B when unchanged; ~3.5 KB for a one-record change vs
  today's ~10 MB full refetch). It also found the complication that makes it a
  plan of its own rather than a phase here: **deletes appear only as absence**,
  with no tombstone. See `plans/2026-08-06-3-plan-incremental-revalidation.md`.

## Review Log

### Pass 1: Plan development — 2026-08-06
Built from a live investigation of the deployed app and PDS. Three candidate
causes for the reported slow loads were measured and two were **disproved**
(revalidation thrash; CID recompute at 95 ms). Sharding schemes, index sizing,
and shard-key choice were each decided against measurements rather than
intuition.

### Pass 2: Gap analysis — 2026-08-06
**Found:**
- **Opaque-response padding would have broken Phase 4 mid-implementation.**
  The original D3 had the CDN as the cached source; measurement showed 7.04 MB
  of quota per opaque entry (42× real bytes, 7.4 GB extrapolated). Verified the
  PDS sends `ACAO: *` and is therefore the only viable cache source. This
  inverted the design before any code was written.
- Phase 2 risk: browse renders from full `CachedRecipe` objects today, so a
  sharded cook's leaner index entries may force a `view.ts` change — flagged
  with an instruction to split rather than absorb (4-file rule).
- Phase 1 risk: `shardFilesFor()` infers "sharded" from the emitted index, so a
  missing `shard` field silently reverts the corpus to eager. Wiring test added
  specifically for that.
- Phase 7 must not run parallel to Phase 4 — both write `src/sw.ts`.
- Documentation Impact was initially empty; `snapshot-seed.json`'s `$comment`
  becomes false at Phase 1 and is now a phase item.
**Concurrency:**
- Parallel set {3, 4→5} confirmed: write-sets disjoint, shared-state contracts
  expressed as invariants (no parent-worktree git mutations, no port binds,
  scoped tmp, distinct IndexedDB/Cache names) with concrete re-entry checks.
- Phase 7 pulled explicitly to sequential on the `src/sw.ts` write-set overlap.
**Changed:**
- Reasoning gained the CORS/opaque section; Verified Assumptions gained the
  probe results; Open Question 1 was reframed from "should getBlob be
  rate-limited" (answered: yes, adaptively) to the source-split decision the
  measurements exposed.
**Confirmed:**
- `hash(rkey)` over `hash(dishKey)` held up; the dishKey argument strengthened
  from inference to code evidence (`propose.mjs:46,54`).
- Browse's lazy loading needs no work — recorded so it is not re-litigated.

### Open-question walk-through + Phase 0 discovery — 2026-08-06
**Found:**
- Q1 resolved to **C+A**, which added **Phase 2B** (bundle a stable thumbnail
  subset). Neither A nor B alone met the stated goal: both leave a fresh offline
  install rendering 4,041 recipes as placeholder art.
- Q1 surfaced that **browse's feed rotates daily** (`browse.ts:190`), so the
  bundled subset needs a stable selection rule — recorded as a Phase 2B risk.
- Q3 was **retired and replaced**. As written it measured a number the plan had
  already routed around; the live risk is iOS silently dropping a 23 MB
  precache, which gates Phase 2B's subset size.
- Tracing Q4 found a **gap in Phase 3**: `browse.ts:703` repeats the per-record
  `cache.put` on the revalidation path. Phase 3 originally batched only
  `load.ts:106`, leaving the pathology live on the path that hurts most.
- **Phase 0 discovery executed** for the Q4 idea before committing to it, using
  an isolated Node 22 (the system node broke mid-session — Homebrew `llhttp`
  9.3/9.4.3 linkage):
  - `getRepo?since=` verified: 59 B unchanged, 8.59 MB across a 3,695-record
    boundary — proportional to real change.
  - CAR reader marginal bundle cost: **+2,376 B gz**, 9.7% of the 24 KB
    per-entry budget — the objection recorded at `revalidate.ts:14` assumed
    shipping dag-cbor too, which already ships.
  - One-record diff: **~3.5 KB**, 9 blocks — MST overhead is modest.
  - **Deletes carry no tombstone.** Create and update put the record block in
    the CAR; delete simply omits it. Since a `since` diff carries only *changed*
    MST nodes, the vanished key set is not recoverable from the CAR alone.
**Concurrency:**
- Phase 2B added to the sequential spine between 2 and 4 — shares
  `scripts/build.mjs` with Phase 2, so it cannot be parallel with it.
- Parallel set {3, 4→5} unchanged; Phase 3's write-set grew by
  `src/pages/browse.ts`, which does not overlap 4 or 5.
**Changed:**
- Open Questions replaced with resolutions; Phase 2B added; Phase 3 gained the
  `browse.ts:703` call site; Concurrency Map extended.
- Q4 promoted out to `plans/2026-08-06-3-plan-incremental-revalidation.md`.
**Confirmed:**
- The remaining phases held up unchanged under the walk-through.

### Pass 3: Quality gates — pending
Run in a fresh context.
