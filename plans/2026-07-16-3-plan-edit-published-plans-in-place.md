# Edit published meal plans in place (Published subpage → staged edit → republish)

**Status:** ✅ **Implemented 2026-07-16.** TDD (red → green). Gate green:
lint · typecheck (both tsconfigs) · 549 unit · build · 185 hermetic e2e. The
new `@live` leg (edit → publish update → same share link, one row) is authored
to the existing not-yet-executed pattern — this worktree has no test
credentials.

## Problem

The "Your published plans" subpage (`meals.html?plans`) lists each published
date-range record with a share link and a guarded Delete — but no way to fix a
published plan. Today the only route is delete + rebuild from scratch, which
also changes the rkey and breaks the share link. Owner ask: an **Edit** button
next to Delete that opens that same date range in the planner, **staged** for
publish, so it can be edited in place; publishing again must **replace the
original record** (same rkey → the share link keeps working).

## Why this is cheap in the current model

- A published plan's **rkey is its plan id** (`meal-plan-sync.ts: rkeyOf`) and
  `putRecord` re-saves overwrite. Writing the edited plan back under the
  original rkey *is* the in-place replace.
- The planner already renders/edits any `LocalPlan`; `getPdsPlan` already
  recovers a published record into the local buffer shape (with cached names).

The one thing the model lacks is a way to hold an edit **staged** (not live):
the planner's `persist()` write-through would otherwise sync every keystroke
straight onto the published record, and the plain planner (`meals.html`) picks
`store.list()[0]`, which a staged copy must never hijack.

## Design

**A staged local copy that remembers its source rkey.**

1. `LocalPlan`/`LocalPlanInput` gain an optional **`editOf?: string`** — the
   rkey of the published record this local plan is a staged edit of. Local-only
   bookkeeping: it is **never** written into the PDS record (`planToRecord`
   enumerates fields explicitly; a unit test pins this).
2. `meal-plan-sync.ts`: publish rkey becomes **`plan.editOf ?? plan.id`** — a
   staged copy republishes onto the original record; everything else keeps the
   stable-id behavior unchanged.
3. New pure module **`src/recipes/meal-plan-edit.ts`**:
   - `findStagedEdit(store, rkey)` — the staged copy for a published rkey, if any.
   - `stagePlanForEdit(store, published)` — resume the existing staged copy or
     save a fresh one (new local id, `editOf` = published rkey).
   - `workingPlans(store)` — plans with no `editOf`; what the plain planner may
     adopt as its working plan.
4. **Published subpage**: each row gets an **Edit** link (testid `plan-edit`,
   button-styled) next to Delete → `meals.html?edit=<rkey>`.
5. **Planner edit mode** (`meals.html?edit=<rkey>`):
   - Signed-in only (mirrors `?plans`): boots the session eagerly behind a
     loading shell; signed out → an invite + back link, no planner.
   - Stages via `stagePlanForEdit` (resume-or-fetch through `getPdsPlan`) and
     opens the normal planner on the staged copy.
   - **`persist()` skips PDS write-through when `plan.editOf` is set** — edits
     stay local ("staged") until Publish.
   - A banner (testid `edit-banner`) says the plan is a staged edit of a
     published plan, with a **Discard edits** button (testid `edit-discard`)
     that removes the staged copy and returns to `?plans`. The Reset control and
     the "Reset on publish" toggle are hidden (Discard replaces both).
   - Publish button reads **"Publish update"**; on success it removes the
     staged copy, republishes the subscribable calendar (same in-place hook the
     Delete path uses), and returns to `?plans` — the row now shows the edited
     range under the *same* share link.
   - The PDS-recovery reconciliation block is skipped in edit mode (it exists
     to adopt plans into the plain planner; the eager boot already set the sync
     agent).
6. **Plain planner**: working-plan selection becomes
   `workingPlans(store)[0]` so an in-flight staged edit never becomes the
   default plan (and never gets write-through synced onto the published record
   by a plain `meals.html` visit).

## Out of scope (noted, pre-existing)

- PDS recovery on a fresh device can adopt the most recent *published* plan as
  the working plan (id = rkey → write-through live-edits it). Pre-existing
  behavior, unchanged here; `editOf` staging is strictly additive.
- Multi-plan management in the planner proper (still the v1 single working plan).

## Tests (written first)

Unit (vitest):
- `meal-plan-local.spec.ts`: `save` persists `editOf` and round-trips through
  `list`/`get`; plans without it stay without it.
- `meal-plan-sync.spec.ts`: `syncPlanToPds` puts under the `editOf` rkey when
  set (in-place replace) and under `plan.id` otherwise; `planToRecord` never
  emits an `editOf` field.
- `meal-plan-edit.spec.ts` (new): staging copies content with a fresh id +
  `editOf`; staging twice resumes the same copy; `workingPlans` filters staged
  copies out.

E2E hermetic (`meals.spec.ts`):
- `?edit=<rkey>` signed out → sign-in invite + back link (mirrors `?plans`).
- A seeded staged copy (`editOf` set) in `arecipe.mealplans.v1` never becomes
  the plain planner's working plan.

E2E live (`meals-live.spec.ts`, authored to the same not-yet-executed pattern):
- Publish → Published subpage → Edit → banner + staged planner → add a second
  recipe → Publish update → back on `?plans` with **one** row (same rkey) →
  shared link shows the edit.

## Outcome

Shipped as designed. Notes from the build:

- `persist()` rebuilds the store input on every save — it had to copy `editOf`
  through explicitly, or the staged copy silently lost its source rkey on the
  first edit (caught while wiring; the resume unit test pins the field's
  round-trip).
- The record shape is unchanged (`editOf` is local-only and `planToRecord`
  never emits it — unit-pinned), so `docs/LEXICONS.md` needed no update.
- Edit mode hides Reset and "Reset on publish"; **Discard edits** (banner) is
  the exit that leaves the published record untouched.
