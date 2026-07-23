# RUN-LAST-PLANNED — outcome summary

Derived planning history (last-planned + planned-count), an archive view of
retained history, and a bounded calendar feed. Delivered under the one rule:
**nothing counts, everything derives.**

Date: 2026-07-23 · Branch: `claude/run-last-planned-c4w98w`

---

## Phase 0 — Re-ground (findings recorded before any code)

All `[verify-in-run]` items probed against the repo as it stands:

- **mealPlan record shape / date expansion.** `src/recipes/meal-plan.ts` holds
  the pure core: `PlanWeek { repeat, days: PlanSlot[] }`, `PlanSlot { meals?:
  PlanMeal[] }` (legacy `recipe`/`note` tolerated), and the exported
  `expandCalendar(weeks: PlanWeek[]): CalendarWeek[]` (repeat-expanded, in
  order). Calendar dates come from `src/recipes/meal-plan-dates.ts`
  (`dateForSlot(startDate, weekIndex, dayIndex)`, floating UTC). **Reused, not
  reimplemented** — `planned-index.ts` and `planned-archive.ts` both drive
  `expandCalendar` + `dateForSlot` with the SAME cumulative row-index mapping
  `ics.ts`/`buildCalendarRows` use.
- **The plan currency is `LocalPlan`** (`meal-plan-local.ts`) — what the Meals
  page and `listPdsPlans` hand around and what `ics.planEvents` already consumes.
  The derivation takes `LocalPlan[]`.
- **`LocalPlan` carries no CID.** D2 asks for "the sorted list of source
  plan-record CIDs"; the local buffer has none, so the fingerprint uses
  `id@updatedAt` (sorted) as the content-identity proxy — `store.save` bumps
  `updatedAt` on every mutation, so any add/edit/remove changes the fingerprint.
  Documented in `fingerprintOf`.
- **drafts-local IDB shape** (`createDraftStore({ dbName })`, `openDb` v1 +
  `keyPath`, `inStore` helper) — `planned-index-local.ts` mirrors it exactly.
  Exclusions store (`isHidden`/`hide`/`unhide` overlay) — the reader posture the
  recipe page already uses.
- **.ics pure core** = `ics.ts` (`planEvents`, `buildMealPlanIcs`, clock-free,
  DTSTAMP injected) over `meal-plan.ts` + `meal-plan-dates.ts`. The feed window
  is a change to that core only.
- **Sort control** = `src/recipes/sort.ts` (`SortMode`, `SORT_MODES`,
  `sortEntries`) surfaced by `src/recipes/toolbar.ts` (radio list over
  `SORT_MODES`), consumed by `browse.ts` + `cookbook.ts`.
- **Browse zero-auth assertion** = `tests/e2e/cook-follows.spec.ts`
  (`expect(createRecordCalls).toBe(0)`), comment "Browse ships zero auth code".
  Re-satisfied by a new Browse test that seeds a cache, proves the reader ran
  (planned sorts appear), and asserts `createRecordCalls === 0`.
- **`archive.html` registration** is an allowlist copy in `scripts/build.mjs`
  (the `PAGES` array + the `HTML` map), **not** a glob — added to both.

## Phase 1 (RED) — tests first

New unit specs (`planned-index`, `planned-index-local`, `planned-archive`,
`planned-feed-window`) + planned-sort cases in `sort.spec.ts`, run before any
implementation existed:

```
Test Files  4 failed (4)
      Tests  4 failed (4)   ← module-not-found: buildPlannedIndex / createPlannedIndexCache /
                              partitionRanges / withinFeedWindow undefined
```

Covers spec items 1–17 (derivation, cache fail-closed, partition, stats, feed
window). E2E items 18–22 authored against the not-yet-wired pages.

## Phase 2 (GREEN) — implement

Order followed: `planned-index.ts` → `planned-index-local.ts` → Meals-page
writer → recipe-page reader → sort options → `archive.html`/`archive.ts` +
`build.mjs` → feed window.

Pure core went green first:

```
Test Files  5 passed (5)      Tests  36 passed (36)   (planned-* + ics)
```

## Phase 3 — Gate

- `npx tsc -p tsconfig.json --noEmit` → clean
- `npx tsc -p tsconfig.tests.json --noEmit` → clean
- `npm run lint` → clean
- `npm run test:unit` → **863 passed (84 files)**
- `npm run build` → clean; `archive 3K/1Kgz` bundled
- e2e (via the throwaway `pw-local.config.ts`, removed after) →
  **228 passed** hermetic, including the five new specs (18–22).

Full `npm run test` fails only at its e2e step in this environment (the
documented Chromium build-pin mismatch); every other sub-gate was run directly
and the e2e run through the local config.

---

## Design realized

- **D1** `src/recipes/planned-index.ts` — `buildPlannedIndex(plans, now)`, pure,
  no clock/IO/mutation; reuses `expandCalendar` + `dateForSlot`. Plus
  `fingerprintOf`, `describePlanned`/`relativePlanned` (recipe-page copy).
- **D2** `src/recipes/planned-index-local.ts` — IDB cache of the serialized index
  + fingerprint; `read({ fingerprint? })` fails closed on mismatch, returns
  absent otherwise; never authoritative.
- **D3** Meals page is the **only** writer — `rebuildPlannedIndex` (union of the
  durable PDS history + local buffer) after every mutation, after sync, on load,
  and on the published-plans page.
- **D4** Browse / Cookbook / recipe page **read only** — no plan-record fetch, no
  PDS, no auth import; absent cache → prior behavior exactly.
- **D5** recipe footer `[data-testid="last-planned"]`: `last planned {relative} ·
  planned {n} times` (`planned once` special-cased), viewer-scoped, absent when
  the recipe isn't in the index.
- **D6** two sorts (`Longest since planned` default-of-pair, `Recently planned`),
  offered only when a cache exists; never-planned quarantined into
  `[data-testid="never-planned-group"]` below a divider —
  `partitionByPlanned` (pure) + a `toolbar` `extraSortModes` seam.
- **D7** `archive.html` / `src/pages/archive.ts`; `partitionRanges` /
  `partitionPlans` (pure) hide fully-past ranges from the active published list
  and render them on the archive page. **No record deleted, trimmed, or
  rewritten.**
- **D8** archive stats block (`[data-testid="archive-stats"]`) — total planned,
  distinct recipes, most-common, span — from `plannedStats` over the same index.
- **D9** `ics.ts`: `FEED_WINDOW_PAST_DAYS = 90` (EXP-ICS-WINDOW) +
  `withinFeedWindow(date, now)` (pure); `buildMealPlanIcs` filters occurrences to
  90 days back through all future, using the injected DTSTAMP as `now`. No
  delivery option changed shape.
- **D10** `docs/LEXICONS.md`: reserved `app.arecipe.plannedRollup` SPECIFIED not
  BUILT, with both load-bearing notes (materialized-aggregate-over-a-closed-
  window, and aggregate-cannot-substitute-for-the-per-recipe-map).

## Acceptance criteria

| # | Criterion | Evidence |
|---|-----------|----------|
| 1 | Counts/dates derive; no stored counter | unit 1–9 + grep below |
| 2 | Cache fingerprinted, fails closed | unit 10–12 |
| 3 | Only Meals writes; others read | D3/D4 + e2e 22 |
| 4 | Recipe page shows viewer's history or nothing | e2e 18, 19 |
| 5 | Sort defaults to rotation; quarantines never-planned | e2e 20 + unit |
| 6 | Archived leave active list, appear under stats, not deleted | unit 13/14/partitionPlans; e2e 21 (signed-out wiring — the signed-in render is unit-covered + `@live`, matching how the published-plans subpage is tested) |
| 7 | Feed = 90d past + all future | unit 15–17 |
| 8 | LEXICONS documents reserved rollup + both notes | `docs/LEXICONS.md` |

## No code path writes a count (grep-backed)

```
$ grep -rn "count" src/recipes/planned-index*.ts src/recipes/planned-archive.ts \
    | grep -iE "setItem|putRecord|createRecord|localStorage"
  (no matches)
```

`count` exists only as a value **computed** inside `buildPlannedIndex`
(`entry.count += 1` while iterating expanded slots) and **read** for display.
The one persisted artifact is the planned-index cache blob
(`planned-index-local.ts` `store.put`), which is the whole recomputed index —
explicitly a cache (D2), rewritten wholesale on every rebuild, never an
incremented/decremented counter. No `putRecord`/`createRecord` anywhere writes a
count to a PDS record.

## Files

New: `src/recipes/planned-index.ts`, `src/recipes/planned-index-local.ts`,
`src/recipes/planned-archive.ts`, `src/pages/archive.ts`, `archive.html`;
`tests/unit/recipes/planned-index.spec.ts`,
`tests/unit/recipes/planned-index-local.spec.ts`,
`tests/unit/recipes/planned-archive.spec.ts`,
`tests/unit/recipes/planned-feed-window.spec.ts`,
`tests/e2e/planned-index.spec.ts`, `tests/e2e/archive.spec.ts`.

Modified: `src/recipes/ics.ts`, `src/recipes/sort.ts`, `src/recipes/toolbar.ts`,
`src/pages/meals.ts`, `src/pages/recipe.ts`, `src/pages/cookbook.ts`,
`src/pages/browse.ts`, `scripts/build.mjs`, `docs/LEXICONS.md`,
`tests/unit/recipes/sort.spec.ts`.

## Out of scope (untouched, per §6)

No `plannedRollup` record written; no plan record discarded/trimmed/rewritten; no
"cooked it" log (copy measures intent — "planned", never "cooked"); no nudges/
notifications; no shopping-list/importer/agents surfaces.
