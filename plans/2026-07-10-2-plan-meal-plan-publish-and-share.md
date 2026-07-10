# Meal plans — date-aligned publish + a shareable, anon-readable calendar

**Status:** ✅ **Shipped 2026-07-10.** All phases landed; decisions taken as the
leanings below (same live `mealPlan` record, `mealplan`=rkey, `user`=DID-or-handle,
floating date-only, single-plan). Verified: unit (date core `meal-plan-dates`,
`getPdsPlan`), hermetic e2e (planner dates + shared read-only view + missing-user
message), and `@live` (publish → open the link anonymously, real PDS round-trip).

## Outcome Summary

| Phase | Outcome | Note |
|---|---|---|
| 0 Discovery | ✅ | `planToRecord`/`planFromRecord` already round-trip `startDate`; read path is public `getRecord` — added `getPdsPlan` to reuse the existing validating mapper. |
| 1 Date core | ✅ | `src/recipes/meal-plan-dates.ts` (`addDays`, `dateForSlot`, `formatShortDate`) — pure, floating/UTC, 9 unit tests (month/year/leap boundaries, invalid anchors). |
| 2 Start-date control | ✅ | Date input on the planner (`plan-start-date`) → `plan.startDate` (persist + PDS write-through); the shared `buildCalendarRows` labels days with real dates when anchored. Hermetic e2e. |
| 3 Publish + share | ✅ | "Publish & share" (`publish-plan`) syncs the plan and surfaces a copyable `meals.html?mealplan=<rkey>&user=<did>` link. `@live`-verified. |
| 4 Read-only shared view | ✅ | `meals.html?mealplan=&user=` branch resolves the owner (DID or handle), reads the plan via `getPdsPlan`, and renders a calendar-only page where each meal links to its recipe — anon-friendly. Hermetic e2e over routed `getRecord` fixtures + `@live` anon open. |
| 5 Polish | ✅ | Missing-`user` guidance message; error state on unresolvable owner / not-found plan. `startDate` was already in the lexicon (no `LEXICONS.md` change). |



## Problem Statement

The meal planner (`meals.html`) is a private, single-plan workspace. You build a
week, meals sync to your PDS (Phase 9), and that's the end of it. Two things are
missing:

1. **Dates.** A plan's weeks are abstract ("Week 1", "Week 2"). There is no way
   to anchor them to real dates, so a plan can't answer "what are we eating on
   Thursday the 16th?"
2. **Sharing.** A finished plan can't be handed to anyone. There is no
   read-only, linkable view of a plan, and nothing an anonymous visitor
   (no account, no app session) can open.

The ask: let the planner set a start date for the first Monday so the calendar
lays out real dates; add a **Publish** action that writes a date-aligned plan to
the PDS; and make it shareable via
`https://arecipe.app/meals.html?mealplan=<id>&user=<did-or-handle>` — a
read-only calendar page where each placed meal links to its recipe, openable by
anyone (including anon, when the `user` param is supplied).

## Approach

Reuse the two patterns already proven in the codebase:

- **Meal-plan record + sync** (`src/recipes/meal-plan.ts`,
  `src/recipes/meal-plan-sync.ts`). The record already carries an optional
  `startDate` field and `weeks: PlanWeek[]`, and `expandCalendar(weeks)` already
  flattens weeks → stamped calendar rows. `syncPlanToPds` / `listPdsPlans`
  already round-trip records to `app.arecipe.mealPlan`.
- **Cookbook's cold-view** (`src/pages/cookbook.ts`, gated on a `?did=` param,
  resolving the target DID → PDS via `resolveDidDoc`, rendering read-only with
  no auth). The shared meal-plan view mirrors this exactly with `?mealplan=` +
  `?user=`.

New/changed surfaces:

1. **Start-date control** on the planner: a date input that sets `plan.startDate`
   (persisted locally + synced). The builder and calendar render the actual
   date per day, counting forward from the chosen Monday across weeks (7 days ×
   week index + day index).
2. **Date math** — a pure module `src/recipes/meal-plan-dates.ts`:
   `dateForSlot(startDate, weekIndex, dayIndex)` and a `calendarDates(startDate,
   weeks)` helper that pairs `expandCalendar` rows with concrete dates. Pure and
   TDD-first (ISO date in, ISO date out; no `Date.now()` in the core).
3. **Publish action** under the planner: writes the current plan to the PDS as a
   shareable, date-aligned record and surfaces the share URL + a copy control.
   (See Open Question OQ1 on whether Publish is the same `mealPlan` record or a
   distinct "published" collection.)
4. **Read-only shared view** — `meals.html?mealplan=<id>&user=<did|handle>`:
   resolve `user` → DID → PDS, `getRecord` the plan, validate, and render a
   calendar-only page (no palette, no builder) with each filled slot linking to
   `recipe.html?u=<slot.recipe.uri>`. Signed-in own plans can omit `user` (we
   know the viewer's DID); anon MUST pass `user`.

## Reasoning

- **Why anchor on "first Monday" rather than storing a date per week?** The plan
  is a repeating template (weeks, with the new "Repeat planned weeks" duplication
  from the 2026-07-10 UI pass). A single anchor date + positional offset keeps
  the record small and keeps "repeat" meaningful — duplicated weeks simply
  continue the date sequence. Storing per-week dates would fight duplication and
  bloat the record.
- **Why mirror the Cookbook cold-view instead of a new page?** Anonymous,
  no-auth, PDS-read-by-DID is a solved problem here; `resolveDidDoc` + the public
  read path need no session. Reusing the pattern keeps the shared view on the
  same zero-auth budget as Browse/Cookbook cold-views (a hard constraint — the
  shared link must open with no account).
- **Why a pure date module?** Date arithmetic across week/day offsets and
  timezones is the only non-trivial logic; isolating it makes it TDD-able without
  a DOM and keeps `Date` out of the render path (pass "today" in explicitly).
- **Why link each meal to its recipe?** The slots already store a strongRef
  (`{ uri, cid, name }`), so the link target is free — `recipe.html?u=<uri>` is
  the existing shareable recipe surface, and it works for anon.

## Open Questions

- **OQ1 — one record or two?** Does **Publish** write the same
  `app.arecipe.mealPlan` record the planner already syncs (so "published" ==
  "synced, with a startDate"), or a separate immutable "published snapshot"
  record/collection so edits to the working plan don't mutate a shared link?
  Leaning: **same record** for v1 (simplest; the planner already syncs it), with
  the share link resolving live. Revisit if users want frozen snapshots.
- **OQ2 — `mealplan` id shape.** rkey of the `app.arecipe.mealPlan` record, or
  the full `at://` URI? rkey is shorter for a URL; the view resolves
  `user`→PDS then `getRecord(collection, rkey)`. Leaning rkey.
- **OQ3 — `user` accepts handle or DID?** `resolveDidDoc` takes a DID;
  `createResolver()` resolves a handle→identity. Accept both (resolve handle
  first if it isn't a `did:` string), mirroring Browse.
- **OQ4 — timezone.** Anchor dates are date-only (no time); render in the
  viewer's locale without TZ conversion (treat as floating dates) to avoid
  off-by-one across timezones. Confirm this matches intent.
- **OQ5 — which plan for anon when `user` has several?** v1 is single-plan per
  the existing planner reconciliation, so `mealplan=<rkey>` disambiguates.

## Phase sketch (TDD-first; each phase leaves the suite green)

0. **Discovery** — confirm `getRecord` read path for `app.arecipe.mealPlan`
   against the test account; confirm `startDate` survives the sync round-trip
   (it's already in `MealPlanValue`); pick OQ1/OQ2 answers.
1. **Date core** (`meal-plan-dates.ts`, pure) — `dateForSlot` + `calendarDates`;
   unit tests for week rollover, month/year boundaries, and the duplicated-weeks
   sequence. No UI.
2. **Start-date control** — date input on the planner wired to `plan.startDate`
   (local persist + existing PDS write-through); builder/calendar show real
   dates. Hermetic e2e: set date → calendar shows dated days.
3. **Publish + share URL** — Publish action; surface + copy the share link.
   Hermetic e2e for the URL construction; `@live` for the PDS write.
4. **Read-only shared view** — `?mealplan=&user=` branch in `meals.ts`
   (calendar-only render, meals link to recipes), reusing the cold-view resolve
   pattern. Hermetic e2e over routed fixtures (mirror `cookbook.spec.ts`'s
   cold-view routing); `@live` for a real published plan opened anonymously.
5. **Polish** — empty/error states (plan not found, user unresolvable), the
   `LEXICONS.md` note if a new field/collection is added, and a share-view
   entry in the nav/OG-meta if warranted.

## Test posture

- Pure date core and URL construction: unit (vitest, happy-dom where DOM is
  needed).
- Cold-view render: hermetic Playwright over routed atproto fixtures (the
  `cookbook.spec.ts` cold-view is the template).
- PDS publish + anon open: `@live` (real test account, gated on `.env` creds),
  mirroring `meals-live.spec.ts`.
