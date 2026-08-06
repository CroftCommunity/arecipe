# Plan: unify the week planner and the calendar preview (plan.html)

**Date:** 2026-08-06 · **Status:** done

## Problem

The Plan builder showed the same information twice: the relative week planner
(abstract `Week 1`, `Mon`–`Sun` day cards) up top, and a separate grounded
"Calendar" preview below it (real dates, or a "Nothing planned yet…"
placeholder). The start-date control lived down in that second section, far from
the weeks it anchors. Two renderings of one plan meant extra scrolling on a
phone and a duplicate surface to keep in sync.

## Decision

Ground the planner itself and delete the preview:

- **D1 — one surface.** The standalone Calendar section (title, lower
  date-picker row, `cal-body`, empty-state placeholder) is removed from
  `plan.html`. `buildCalendarRows` survives solely as the SHARED read-only
  view's renderer (`meals.html?mealplan=…`), which keeps its own calendar.
- **D2 — start control leads the builder.** The "Starts (first Monday)" date
  input moves to the top of the builder column, above the Week 1 block. Any
  picked date **snaps back to its week's Monday** (`mondayOf`, new in
  `meal-plan-dates.ts`; Sunday counts as the end of the week). Clearing the
  input still returns the plan to abstract "Week N".
- **D3 — grounded headers.** Anchored, each week header carries its real span —
  `Week 1 (Aug 10 – Aug 16)` — and each day card stamps its date —
  `Mon 8/10` (`formatDayMonth`, compact M/D so seven columns still fit 320px).
  Week N+1 continues from the start (+7 days per week; UI weeks don't expand
  `repeat`, so the layout is continuous).
- **D4 — today highlight.** The day card matching today's date gets `is-today`
  (enamel ring + full-strength label).
- **D5 — non-destructive shift.** Re-anchoring only relabels; placements are
  untouched (startDate was always label-only — pinned by a test now).
- **D6 — state.** The anchor syncs to the URL (`?start=YYYY-MM-DD`, via
  `history.replaceState`) and persists in localStorage through the existing
  plan store (`arecipe.mealplans.v1` — the plan record owns `startDate`; no
  second key, one source of truth). `?start=` in a link wins on load, snapped.
  A staged edit (`?edit=`) skips URL sync and keeps the published record's
  date. Reset / reset-on-publish re-anchor the fresh canvas on the next Monday
  (the same D7 default a fresh load gets).

## Outcome

Done in one pass. `mondayOf` + `formatDayMonth` unit-tested
(`meal-plan-dates.spec.ts`); the unified view, snap, URL sync, today highlight,
and non-destructive shift pinned in `tests/e2e/meals.spec.ts`. The old
calendar-preview e2e assertions were rewritten against the grounded builder;
`mobile-fit` now waits on the builder. Full gate green (lint · typecheck ·
993 unit · build · 286 e2e).
