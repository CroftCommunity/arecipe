# Recipe-count discrepancy: Browse (417) vs Plan palette (2918)

Date: 2026-08-01
Status: done (reworked 2026-09-08, see Outcome)

## Problem statement

The two "Browse" surfaces disagree on how many recipes exist over the *same*
starter corpus:

- **index.html Browse** (`src/pages/browse.ts`) shows **417 recipes**.
- **plan.html Browse palette** (`src/pages/meals.ts` → `loadStarterPalette`)
  shows **1–10 of 2918**.

Both read the same four starter cooks (`snapshot-seed.json`), same collection
(`exchange.recipe.recipe`). The gap is not a counting-logic bug in either view
— it is the *source* each reads from.

## Root cause (verified against production, build `2026.07.23-a17afea`)

1. **The deployed build-time snapshot is stale.** It was captured on 2026-07-23
   and recorded **418** records total (`arecipe.bsky.social` = 346). Since then
   the Wikibooks corpus was published to `arecipe.bsky.social` via `wbsync`
   (commit `6d773ff`), which now holds **2846** records live (~2918 across all
   four cooks). No deploy has happened since, and the snapshot only regenerates
   on a `main` deploy (`.github/workflows/ci.yml`).

2. **Browse first-paints the stale snapshot** (`loadSnapshotFeed` → 418 → 417
   after one hidden/pref filter). The Plan palette skips the snapshot entirely
   and reads live (`loadStarterFeed`), so it sees the real ~2918.

3. **Revalidation would catch Browse up, but it is lagged and the refetched
   data is thrown away between sessions.** `revalidateCooks` correctly detects
   the change (snapshot rev `3mqkbt3rx2r24` ≠ live rev `3mrfpgxkmfh2f`) and
   refetches, but:
   - it runs off the critical path and is **debounced 60 min cross-session**
     (the clock lives in IndexedDB, `src/snapshot/store.ts`), and
   - the refetched records are written with `putDelta` but **`getDelta` is
     never called anywhere** — the delta cache is write-only. On the next boot,
     `loadSnapshotFeed` re-paints the stale bundle and, if the debounce is
     active, never refetches. A full 2846-record delta can sit unused in
     IndexedDB while Browse shows 417.

So a returning visitor is stuck on the stale count for up to an hour per
session, and the count the user photographed is that stuck state.

## Fix (three parts, per the maintainer's request)

### Part 1 — Make the Browse count trustworthy across sessions (code)

Apply the stored delta on boot instead of discarding it.

- `src/snapshot/store.ts`: record the latest rev alongside the delta and add
  `getLatestDelta(did)` returning the newest stored `{ rev, records }` for a
  cook (build-scoped, like everything else here).
- `src/pages/browse.ts`: after seeding `entriesByDid` from the bundle and
  before revalidation, overlay any stored per-cook delta so a debounced return
  paints the last-known-live corpus (and count) immediately. Live revalidation
  still wins when it completes.

This turns the write-only delta cache into a real cross-session cache and
removes the "stuck at 417 for an hour" window. It does **not** slow first paint
(the overlay is a local IndexedDB read; the bundle still paints first).

### Part 2 — Keep the deployed snapshot fresh (ops/CI)

The snapshot only refreshes on a `main` deploy, so it drifts whenever a cook
publishes between deploys — exactly what happened here. Add a **scheduled**
workflow (`.github/workflows/snapshot-refresh.yml`) that re-captures the seed
cooks and redeploys the built site daily, reusing the same steps and the
`gh-pages` concurrency group as `ci.yml`'s deploy job. This bounds snapshot
staleness to ~1 day regardless of code-deploy cadence.

> Immediate production fix: a redeploy of `main` (or one manual run of the new
> workflow) regenerates the snapshot with the full corpus. That is an
> operational action outside this branch.

### Part 3 — Reconcile the two surfaces' semantics (code)

`loadStarterPalette` maps every live record to a chip with no exclusions, so a
recipe hidden in Browse still shows as a plannable chip. Apply the same hidden
exclusions to the palette so the two pools are consistent. Diet/taste stay
Browse-only *view* preferences (a planner should not silently drop recipes on a
standing taste preference); this is documented at the call site. After Part 1
brings Browse up to the live corpus, the two counts agree up to the user's
hidden set (and any Browse-only diet/taste filter, by design).

## Tests (TDD)

- `tests/unit/snapshot/revalidate.spec.ts` — a changed cook re-points its
  hydration marker at the refetched uris, after `onChanged` stored them; an
  unchanged cook leaves it alone. (RED first — replaced the `getLatestDelta`
  store tests in the 2026-09-08 rework, see Outcome.)
- `tests/unit/snapshot/drift.spec.ts` — `snapshotDrift` (the refresh guard):
  unchanged → no deploy; a moved rev → deploy; a cook new to the seed → deploy;
  a cook the capture lost → named, so the workflow refuses. (RED first.)
- `tests/unit/recipes/meal-plan-palette.spec.ts` — hidden URIs are excluded
  from `loadStarterPalette`. (RED first.)
- e2e (`tests/e2e/snapshot-revalidate.spec.ts`) — the refetched set from a
  prior session survives a reload while debounced, with zero network (count
  reflects the refetched set, not the bundle). This is the behavior pin; it
  went RED against main's hydration path and green with the marker re-point.

## Outcome

Landed 2026-08-01 on the branch; **reworked 2026-09-08** before merging, because
the branch had been written against a `main` with no hydration path and PR #86
(recipe-loading perf) landed one in between. Rebased onto `main` (55 commits;
conflicts only in `store.ts`/`store.spec.ts`, both purely additive).

### Why Part 1 was rewritten, not just rebased

- A "delta" is not a delta: `revalidateCooks` refetches and **replaces the whole
  cook**, so for `arecipe.bsky.social` the stored delta is the full corpus
  (~2,850 records).
- The original overlay replayed that on **every boot** through per-record
  `cache.put` (a CID verification + an IndexedDB write each, serially, on the
  boot path). PR #86 built the hydration marker precisely to stop re-verifying
  the corpus on boot; the overlay would have undone it.
- `main`'s `onChanged` already writes the refetched cook into the recipe cache
  in one batched `putMany`. The fresh records were already there; the only gap
  was that the **hydration marker still named the stale shard's uris**, so the
  next boot's fast path served the old set.

So Part 1 is now one line of lifecycle in `src/snapshot/revalidate.ts`: after
`onChanged` has stored the records, `setHydratedUris(did, refetched uris)`. The
next boot serves the fresh set through the fast path that already exists — no
readback loop, no new store method. `getLatestDelta` is gone; `putDelta` stays
write-only (a separate question whether the deltas store earns its keep).

### Part 2 as landed

`.github/workflows/snapshot-refresh.yml`, daily + `workflow_dispatch`, with two
changes from the original:

- Actions are **SHA-pinned** (the convention `main` adopted 2026-08-29; the
  original used floating `@v7` tags).
- A **no-change guard** (`scripts/snapshot-drift.mjs`, pure logic unit-tested):
  the capture's manifest is compared with the one the live site serves, and
  the rebuild + deploy run **only when a seed repo's rev moved**. Why: a rebuild
  carries a new version string, and a new version makes every client refetch
  the whole snapshot (`docs/CI-TROUBLESHOOTING.md`), so an unconditional daily
  deploy would cost every visitor a full refetch on days nothing changed. The
  guard also refuses (exit 2) a capture that **lost** a cook the live site
  serves — including the 0-cook case the original guarded — since deploying it
  would drop them in the name of freshness. A live-side read failure fails the
  job the same way; the last good snapshot stays live and tomorrow retries.

The alternative — drop the workflow and make "deploy after a sync" an operator
step — was rejected because three of the four seed cooks publish on their own
schedule; with the guard, the daily run is nearly free.

### Part 3 as landed

Unchanged from the original: `loadStarterPalette` / `loadCookbookPalette` /
`loadHandlePalette` take an `isHidden` predicate (wired to
`createExclusions().isHidden` in `meals.ts`), so a recipe hidden in Browse is
no longer offered as a plannable chip. Diet/taste stay Browse-only, by design.

### Status of the original symptom

Resolved by deploys since: the live build `2026.09.09-db666a7` carries every
seed cook at its live rev (checked 2026-09-08 via `getLatestCommit` on each
PDS). What this plan now guards against is the recurrence.
