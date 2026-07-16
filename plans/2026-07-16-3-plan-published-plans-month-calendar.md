# Published-plans month calendar — read-only calendar view under the plans list

**Status:** ✅ **Implemented 2026-07-16.** Gate green: lint · typecheck (both
tsconfigs) · 566 unit (25 new) · build · 183 hermetic e2e. Verified end-to-end
against the built app (preview demo session + mocked PDS reads): month grid,
day expansion with recipe links, month paging, overlap stacking, and zero
horizontal overflow at 390px and 320px.

## Problem

`meals.html?plans` ("Your published plans") is a flat list of date-range rows.
The owner asked (screenshot, 2026-07-16): below that list, show the same
published plans **as a calendar** — a divider between the two, days with
planned recipes filled in, and tapping a day expands it to the day's recipes as
clickable links. Strictly **read-only**: a view of what's published, not
another editor.

## Approach

- **`src/recipes/meal-plan-month.ts` (new, pure, clock-free).** The month math
  lives outside the DOM so it is unit-testable (vitest runs in node):
  - `mealsByDate(plans)` merges every **dated** plan (undated ones have no
    calendar position) into one date → meals map via the existing
    `expandCalendar` + `dateForSlot`, so week `repeat` and multi-week offsets
    behave exactly like the planner calendar. Overlapping plans stack on a
    day; an exact cross-plan duplicate (same date + category + recipe uri)
    collapses to one entry — it would render as an identical link.
  - `monthGrid` lays a `YYYY-MM` key out Monday-first (matching plans
    anchoring on Mondays), padded to whole weeks with `null`s.
  - `monthOfDate` / `monthLabel` / `addMonths` — strict keys, null (never
    throw) on malformed input, year rollover.
  - `defaultMonth(today, filledDates)` — open on today's month when it holds a
    planned day (or when nothing is planned at all); otherwise the nearest
    planned month (upcoming preferred, else most recent past), so the calendar
    never opens blank while plans exist.
- **UI (`showPublishedPlans` in `src/pages/meals.ts`).** The list renders into
  its own container; below it an `<hr class="plans-divider">` and a
  `month-cal` section (both hidden when no dated meals exist — e.g. an empty
  list, so signed-out/empty states are unchanged). Header row `‹ July 2026 ›`
  pages months. Only planned days are interactive (`<button>` with a meal
  count badge, `aria-expanded`/`aria-label`); selecting one inserts a
  full-width panel directly under that week row (grid auto-placement) with the
  day's recipes as `recipe.html?u=` links — `mealLineText` labels, same as the
  shared view. Tap again to collapse; month nav clears the selection; deleting
  a plan above redraws the calendar from the filtered list.
- **Mobile-first.** 7 × `minmax(0, 1fr)` columns — the grid compresses instead
  of overflowing; verified 0px horizontal overflow at 390 and 320.

## Outcome

Shipped as planned. No record-shape change (`docs/LEXICONS.md` untouched — the
calendar is a derived view of existing `app.arecipe.mealPlan` records). The
signed-in subpage stays out of hermetic e2e reach (OAuth), so coverage is the
25 pure unit tests plus the scripted end-to-end verification noted above.
