# Recipe-count discrepancy: Browse (417) vs Plan palette (2918)

Date: 2026-08-01
Status: proposed

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

- `tests/unit/snapshot/store.spec.ts` — `getLatestDelta` returns the newest
  stored delta; absent → null; build-scoped isolation. (RED first.)
- `tests/unit/recipes/meal-plan-palette.spec.ts` — hidden URIs are excluded
  from `loadStarterPalette`. (RED first.)
- e2e (`tests/e2e/snapshot-revalidate.spec.ts`) — a stored delta from a prior
  session survives a reload while debounced (count reflects the delta, not the
  bundle).

## Outcome

Done 2026-08-01, all three parts landed together.

- **Part 1** — `src/snapshot/store.ts` gained `getLatestDelta` (a per-cook
  latest-rev pointer written by `putDelta`); `src/pages/browse.ts` overlays the
  newest stored delta over the bundle on boot, before revalidation. The
  write-only delta cache is now read on boot, so a returning visitor sees the
  last-known-live count immediately instead of the stale bundle count.
- **Part 2** — `.github/workflows/snapshot-refresh.yml` re-captures + redeploys
  daily (and on `workflow_dispatch`), with a guard that aborts rather than
  deploy an empty capture over the good live snapshot.
- **Part 3** — `loadStarterPalette` / `loadCookbookPalette` / `loadHandlePalette`
  now take an `isHidden` predicate (wired to `createExclusions().isHidden` in
  `meals.ts`), so a recipe hidden in Browse is no longer offered as a plannable
  chip. Diet/taste stay Browse-only, by design (documented at the call site).

Tests: `getLatestDelta` unit tests + a palette-exclusion unit test + an e2e
proving a stored delta survives a debounced reload. Full gate green (lint,
typecheck, 989 unit, build, 284 e2e).

**Follow-up (operational, off this branch):** production still serves the
2026-07-23 snapshot until a `main` deploy or a manual `snapshot-refresh` run
regenerates it — either fixes the live count immediately.
