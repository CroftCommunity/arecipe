# Multi-meal scheduling — many recipes per day, meal-typed calendar

**Status:** ✅ **Built 2026-07-13** on branch `claude/multi-meal-scheduling-ux-uixghv`.
All layers landed with the confirmed design; full gate green (lint · typecheck ·
369 unit · build · 155 e2e, incl. new multi-meal/cap/category-label/mobile-remove
specs). The two flagged defaults hold: lowering the cap never deletes over-cap
meals (and can't drop below what's already placed), and the calendar shows meals
in placement order. Legacy single-`recipe` records/buffers migrate on read.

## Problem Statement

The meal planner assumes **one recipe per day**. `PlanSlot` (and `LocalSlot`,
and the `app.arecipe.mealPlan` `#slot` lexicon) is literally `{ recipe?, note? }`.
Real meal planning is several-recipes-to-one-day: a day has a breakfast, maybe a
snack, a dinner. The current tap-to-place / ×-to-remove UX also doesn't scale to
several meals on a phone — the × targets get too small to hit reliably.

We want:

1. **Many recipes per day**, bounded by a **"meals per day" cap** the planner
   sets from a dropdown at the top of the Meals page (next to *My plans*).
2. **Meal-type labels derived from the recipe itself.** Recipes already carry a
   `recipeCategory` (Breakfast / Lunch / Dinner / Snack / Dessert / … — the same
   curated vocabulary `taste-preference.ts` filters on, already surfaced on
   `PaletteItem.category`). The label is that category, title-cased, or absent.
   No new per-placement type picker.
3. **A meal-typed calendar.** Each day lists its meals, one line each, as
   `Category: Recipe` (or just `Recipe` when the recipe has no category). This
   flows through both the in-app calendar and the published/shared view.
4. **A phone-friendly remove path.** Tap a day's header to **expand** it (taller
   cell) so per-meal × targets and a per-day "Clear day" are comfortably
   tappable. Add stays one-tap: arm a chip, tap a day, it fills the next open
   slot up to the cap.

## Design decisions (confirmed)

- **Meal label = recipe's own category**, cached on the placed meal at placement
  time (exactly how `name` is already cached on the slot for offline/cross-device
  display). Absent category → no label, just the recipe name.
- **"Meals per day" is a numeric cap** (1–6), stored on the plan. It gates
  *adding*; it never deletes already-placed meals. Lowering the cap below a day's
  current count leaves the extras in place and removable (they just can't be
  re-added past the cap).
- **Add = fill next open slot.** Arm chip → tap day → append if under cap.
- **Remove:** every meal has a × (desktop, always visible). On a phone the ×
  targets live inside the day, which is collapsed by default; tapping the day
  header expands it (`.day--expanded`) so the ×'s and a "Clear day" button are
  tappable. Whole-plan **Reset** is unchanged.
- **Calendar order = placement order** (predictable, matches "next open slot").
  Canonical meal-time sorting is a possible fast-follow, not v1.

## Data model change

New shared type in `src/recipes/meal-plan.ts`:

```
type PlanMeal = { recipe: StrongRef; note?: string };   // record shape
type PlanSlot = { meals?: PlanMeal[]; /* legacy */ recipe?: StrongRef; note?: string };
```

- **Local buffer** (`meal-plan-local.ts`): `LocalMeal = { recipe: {uri,cid,name},
  category?: string; note?: string }`; `LocalSlot = { meals: LocalMeal[] }`.
  `category` + `name` are cached display hints (non-authoritative), same posture
  as today's cached `name`.
- **Plan level:** add `mealsPerDay: number` to `LocalPlan` / `LocalPlanInput`
  and to the record.
- **Backward compatibility (read):** a legacy slot with `{recipe, note}` and no
  `meals` migrates to `{ meals: [{ recipe, note }] }`. A plan with no
  `mealsPerDay` defaults to the greater of 1 and the largest day's meal count so
  existing plans open without truncating.
- **Write:** new shape only (`meals[]`), plus per-meal open-world `name` +
  `category` caches (mirrors the existing per-slot `name` cache). All readers are
  the same static app, deployed together.

## Lexicon (`tests/fixtures/lexicons/app.arecipe.mealPlan.json` + `docs/LEXICONS.md`)

- `#slot`: add `meals` — array (max e.g. 6) of a new `#meal` def. Keep `recipe` +
  `note` on `#slot`, marked deprecated/legacy, so old records still validate.
- New `#meal`: `{ recipe: strongRef (required), note?: string(≤500) }`.
- `main.record`: add `mealsPerDay` integer (min 1, max 6, default 3).
- `validateMealPlanValue` keeps the 7-days-per-week invariant; tolerates both
  slot shapes (open-world).

## Work breakdown

| # | Layer | File(s) | What |
|---|---|---|---|
| 1 | Model | `src/recipes/meal-plan.ts` | `PlanMeal`, meals-array `PlanSlot`, legacy-tolerant validation, `slotWithRecipe`→`mealWithRecipe`, keep `expandCalendar` (days pass through). Unit tests: legacy migration, multi-meal validation, 7-day invariant. |
| 2 | Lexicon | fixture + `docs/LEXICONS.md` | `#meal`, `slot.meals`, `mealsPerDay`; note deprecation of `slot.recipe`. |
| 3 | Local store | `src/recipes/meal-plan-local.ts` | `LocalMeal`, `LocalSlot.meals`, `mealsPerDay` on plan, deep-clone meals in `cloneWeek`/`duplicateWeeks`, legacy read-migration + cap defaulting. Unit tests. |
| 4 | Sync | `src/recipes/meal-plan-sync.ts` | `mealToRecord`/`slotToRecord` over `meals[]` with `name`+`category` caches; `planFromRecord` maps meals + migrates legacy `recipe` + reads `mealsPerDay`; `planToRecord` writes `mealsPerDay`. Unit tests incl. a legacy-record round-trip. |
| 5 | Calendar render | `src/pages/meals.ts` `buildCalendarRows` | Per day: a line per meal, `Category: Name`; shared view links each name. Empty-state checks `meals.length`. |
| 6 | Cap control | `src/pages/meals.ts` | "Meals/day" `<select>` (1–6) in `meals-actions`; persists `mealsPerDay`; re-renders builder. |
| 7 | Builder + add | `src/pages/meals.ts` `renderBuilder` | Day cell renders its meals stacked; tap/drop appends to next open slot if `< mealsPerDay`; each meal a × ; disable placing when full (visual "full" state). |
| 8 | Mobile remove | `src/pages/meals.ts` + `styles.css` | Day header toggles `.day--expanded`; "Clear day" per day; phone-scoped CSS gives expanded cells room + ≥44px × targets. |
| 9 | Tests | `tests/unit/*`, `tests/e2e/meals*.spec.ts`, `mobile-fit.spec.ts` | Multi-place + cap enforcement, category labels in calendar + shared view, mobile expand→remove, publish/share round-trip carrying multiple meals, legacy-plan open. |
| 10 | Docs | plan close-out + `README`/`BUILD-PLAN` note if warranted | Record outcome. |

## Non-goals (v1)

- Per-placement manual meal-type override (label always comes from the recipe).
- Canonical meal-time ordering in the calendar (placement order for now).
- `.ics` / external-calendar export (the "calendar" is the in-app + shared view).
- Reordering meals within a day beyond remove/re-add.

## Verification

`npm run test` (lint + typecheck + unit + build + e2e), plus a preview deploy on
the PR to click through multi-meal add, cap, mobile expand/remove, and a shared
link. Legacy plans (single `recipe` slots already in a PDS) must open unchanged.
