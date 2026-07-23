# Promote Plan + Menu to top-level tabs; move Alchemy under Cookbook

Date: 2026-07-23
Status: proposed (supersedes the earlier sub-tab-switcher draft in this file's history)

## Problem statement

Today the Meals destination is one tab (the plan **builder**) with a "Menu ↗"
link off to a second view (`meals.html?plans`, the **published plans** list +
calendar). The two surfaces read as one page plus a link rather than two
first-class destinations, and "Alchemy" occupies a top-nav slot even though it's
really the authoring hub you reach on the way to/from your Cookbook.

## Approach

Flatten the navigation:

```
 Browse   Cookbook   Plan   Menu        (+ Reference, Timers — desktop-only)
```

- **Plan** — the meal-plan builder (today's default meals view).
- **Menu** — the published plans list + calendar (today's `?plans` view).
- **Alchemy** leaves the top nav. The Cookbook page's "New Recipe" link is
  relabeled **Alchemy** and points at `mine.html`; new-recipe creation happens
  inside Alchemy (it already has its own "New" affordance). `mine.html` itself
  is unchanged and still reachable directly.

### Two pages, one module (chosen with the user)

Plan and Menu are distinct nav tabs, but the nav highlights the active tab by
matching the URL **path** only. So they get distinct paths, both served by the
existing `meals.js`:

| Path | View | Notes |
| --- | --- | --- |
| `/plan.html` | Plan (builder) | new thin shell → `<script src=./meals.js>` |
| `/meals.html` | Menu (published) | existing shell; now defaults to the published view |
| `/meals.html?mealplan=<rkey>&user=<did>` | shared read-only plan | unchanged (public share link, Menu domain) |
| `/plan.html?edit=<rkey>` | staged-edit sub-flow | the builder, so it lives on the Plan path |

`meals.ts` routes on `window.location.pathname`: `/plan.html` (or `?edit=`) →
builder; otherwise → published. The old `?plans` / `?planning` / `?meals` query
params are dropped (pre-1.0, no aliases).

### File / testid stability

- `meals.html` stays (it owns `?mealplan=` share links, SW precache, OAuth
  allowlist). Only its nav *label* becomes "Menu".
- New file `plan.html` (copy of the meals shell, `<title>` "plan").
- `mine.html` and its `tab-mine` testid are untouched as a page; only the nav
  *tab* is removed.

## Touch points

- `src/nav.ts` — `DESTINATIONS`: drop the Alchemy (`tab-mine`) entry; add `Plan`
  (`tab-plan`, `./plan.html`, match `/\/plan\.html$/`) and keep `Menu`
  (`tab-meals`, `./meals.html`, label "Menu"). Order: Browse · Cookbook · Plan ·
  Menu · Reference · Timers. Mobile bottom bar = first four.
- `plan.html` — new shell (copy `meals.html`, title "arecipe — plan").
- `src/pages/meals.ts`
  - Route on pathname: `onPlanPage = /\/plan\.html$/.test(pathname)`. Builder
    when `onPlanPage || editRkey !== null`; else `showPublishedPlans`.
  - Remove the sub-tab switcher work entirely (no `renderMenuTabs`).
  - Builder: drop the "Meals" `<h2>` title row and the "Menu ↗" chip
    (`my-plans`).
  - `showPublishedPlans`: no title/back-link; keep the Archive link on a slim
    header row; empty + signed-out states nudge to **Plan** (`./plan.html`).
  - Redirects: post-publish/delete `assign('./meals.html')` (Menu). Published
    "Edit" button + recovery "Resume" → `./plan.html?edit=<rkey>`. Edit-mode
    back-link → `./meals.html`.
- `src/pages/cookbook.ts` — "New Recipe" link → label "Alchemy", href
  `./mine.html` (keep the right-aligned placement).
- `src/pages/archive.ts` — "Back to published plans" back-link → `./meals.html`.
- `styles.css` — remove `.meals-plans`; no `.meals-tabs` switcher needed.
- Plumbing for the new page: `src/auth/oauth-client.ts` allowlist (`/plan.html`),
  service-worker precache list, and any build step that enumerates HTML shells.
- `docs/` — update any `meals.html?plans` references.

## Tests (TDD — RED first)

Unit (`tests/unit/nav.spec.ts`):
1. Tabs render Browse · Cookbook · Plan · Menu · Reference · Timers (order + hrefs).
2. `tab-mine` (Alchemy) is no longer in the nav.
3. `tab-plan` → `./plan.html`; `tab-meals` label "Menu" → `./meals.html`.
4. Active-tab: `/plan.html` → `tab-plan`; `/meals.html` → `tab-meals`.

E2E:
5. `/plan.html` renders the builder (palette / per-day grid); `tab-plan` active.
6. `/meals.html` renders the published view; `tab-meals` active.
7. Cookbook: the right-aligned link reads "Alchemy" and points at `./mine.html`
   (replaces the "New Recipe" → editor assertion).
8. Menu signed-out: "Sign in" + a "Start planning" link to `./plan.html`.
9. Menu empty (signed-in, zero plans): "Start planning" link to `./plan.html`.
10. `?edit=` served on `/plan.html`; its back-link → `./meals.html`.
11. Move builder e2e gotos from `/meals.html` to `/plan.html` (the bulk).
12. `archive.spec.ts`: `archive-back` → `/meals\.html$/`.
13. Delete the `my-plans` "Menu ↗" test.
14. `mobile-fit.spec.ts`: `/plan.html` and `/meals.html` at 320/360/390px.

## Reasoning

- **Flatter beats nested.** Two peer tabs are more discoverable than a tab with a
  hidden sub-view; the user navigates directly to either.
- **Two shells, one module** keeps clean per-tab URLs and clean nav highlighting
  without splitting the 74KB `meals.ts` into two entry points. The shell is only
  a `<script>` tag; `meals.ts` already has two render paths to route between.
- **Alchemy as a Cookbook affordance** matches how it's used (author from your
  Cookbook) and frees a top-nav slot for Plan without growing the mobile bar.
- **Menu default + Plan nudge.** With published plans as their own tab, a new or
  signed-out cook may land on Menu with nothing to show; the "Start planning"
  link keeps that from being a dead end.

## Out of scope

- Renaming `meals.html` / `mine.html` or their testids as pages.
- Changes to the shared-plan (`?mealplan=`) or Alchemy (`mine.html`) internals.
- Calendar-publish behavior.
