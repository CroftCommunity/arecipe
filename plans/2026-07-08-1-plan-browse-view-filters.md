# Browse page — view modes, image + label filtering, header polish

**Status:** ✅ Closed (2026-07-08). All 9 phases shipped (0 discovery + 1–8 UI +
9 ops incl. the live record correction). Worktree `browse-view-filters`; not
pushed. Full hermetic gate green; nothing deferred.

## Outcome Summary

| Phase | Outcome | Commit | Note |
|-------|---------|--------|------|
| 0 Discovery | ✅ done | (pre-exec) | Compact bar, two dropdowns, diet in Settings. |
| 1 Header + render seam | ✅ SHIPPED | `a3d9ae9` | `renderCurrent()` seam; `.browse-toolbar` with right-aligned count + `set dietary preference ↗` link; dropped `· N hidden`. |
| 2 Browse-state core | ✅ SHIPPED | `fef5f29` | `recipeFacets`/`matchesFilter`/`availableFacets`/`createBrowsePrefs` + shared `createDietPreference`; 18 unit tests. |
| 3 Photos-only | ✅ SHIPPED | `bc9488e` | Photos-only toggle filters via `matchesFilter`; diet-pref applied; `N of M shown` when filtered; new `browse.spec.ts` + mixed fixture. |
| 4 Details renderer | ✅ SHIPPED | `7e13878` | `renderRecipeDetailsList` (row=link, thumb+name+desc+facet chips); shares `recipe-item` testid; 6 unit tests. Wired in Phase 5. |
| 5 View-mode wiring | ✅ SHIPPED | `f7a0b4b` | Segmented Tiles/Details toggle; `renderCurrent` picks renderer from `state.view`; persisted; composes with photos-only. 2 e2e cases. |
| 6 Facet dropdowns | ✅ SHIPPED | `14fe0d5` | `renderFacetDropdown` (details name=browse-facet, checkbox options w/ data-dimension/value; null when empty). 4 unit tests. Wired in Phase 7. |
| 7 Label filtering | ✅ SHIPPED | `e172c99` | Meal/Cuisine dropdowns wired; facet change refreshes count+list only (panel stays open); inert stale facets; outside-click close; DESIGN note. 4 e2e; full gate green. |
| 8 Settings diet pref | ✅ SHIPPED | `6e7644e` | "Only show me" section (id=diet-preference) writes `diet-preference`; Browse reads it cross-page. `DIET_OPTIONS` vocab. 2 e2e + 1 unit. |
| 9 Record data hygiene | ✅ SHIPPED | `c33dbd0` | Ops script + 4 transform tests; live run done — 1 record (`3mq3m2skev52f`, "Greek Cucumber Tomato Feta Salad") `side dish`→`side`, readback clean, idempotent. |

## Problem Statement

The Browse page (`src/pages/browse.ts`) renders the starter feed (and handle-search
results) as a single fixed grid of tiles via `renderRecipeList`. The status line reads
`N starter pack recipes (V verified) · H hidden`, left-aligned. Users want richer control
over how the feed is viewed and narrowed:

1. **View mode toggle — Tiles / Details.** Tiles = the current card grid. Details = one row
   per recipe showing the image + description.
2. **Quick "photos only" toggle** — show only recipes that have an image.
3. **Label-metadata filtering** — filter by dietary/meal/cuisine labels (vegetarian, dinner,
   breakfast, Greek, …) already stored on records.
4. **Drop the `· N hidden` note** from the status line.
5. **Right-align** the `N starter pack recipes (V verified)` count.

Constraints: static PWA, **no backend**; the Browse document ships **zero auth code**
(enforced by a bundle-split e2e test) — everything here is client-side over the public read
path. **TDD is non-negotiable** (repo CLAUDE.md). Must not break the existing `starter` /
`recipes` e2e suites. Another agent is concurrently working the social layer (Phase 9x) in
`src/social/*` and `tests/**/social|comments` — this plan must stay off those files.

## Reasoning

**Labels are already on the records** — `recipeCuisine` (plain word), `recipeCategory`
(plain word), `suitableForDiet` (token refs like `exchange.recipe.defs#dietVegetarian`),
and `keywords[]`. No lexicon or write-path change is needed; all filtering is pure,
client-side, over the `CachedRecipe[]` the page already holds. This is the central reason
the feature is low-risk: it is a **read/derive/render** change, nothing touches the PDS.

**Testability drives the layering.** The project already separates pure derivations
(`present.ts`, unit-tested in vitest), DOM rendering (`view.ts`, unit-tested via
`@vitest-environment happy-dom`), and page wiring (`browse.ts`, covered by routed-fixture
Playwright e2e like `tests/e2e/starter.spec.ts`). We mirror that split:
- **Pure logic** (facet extraction, filter predicate, preference persistence) → a new
  `src/pages/browse-state.ts`, unit-tested. This is the TDD core.
- **Rendering** (Details rows, the toolbar, facet chips) → additions to `view.ts`,
  unit-tested via happy-dom.
- **Wiring** (assembling the toolbar, applying state, re-rendering, persistence) →
  `browse.ts`, proven by e2e that drives the built bundle against routed fixtures.

**Faceted-filter semantics: OR within a dimension, AND across dimensions.** Selecting
`breakfast` + `dinner` shows recipes that are breakfast *or* dinner (a recipe can't be
both, so AND would show nothing); adding `vegetarian` then narrows to
`(breakfast OR dinner) AND vegetarian`. This is the standard, least-surprising facet model.
"Photos only" is just another AND clause in the same predicate.

**One toolbar, both render paths.** `browse.ts` has *two* places that render a list:
`showEntries` (handle-search results) and `showStarterFeed` (default feed). The toolbar and
its filter/view state must affect **whichever list is currently shown**. So Phase 1 first
refactors both paths to funnel through a single `renderCurrent()` seam that holds the
current `CachedRecipe[]` and re-renders on demand; later phases hook toolbar state into that
seam. Without this, a filter wired only into the starter path would silently not work after
a search.

**Persistence in `localStorage`, following the existing defensive pattern.** View mode,
photos-only, and selected facets are preferences a user expects to survive across sessions
(like `theme` and `starter-pack-disabled`), not just within a tab (`last-find` uses
`sessionStorage` because it's transient search state). All storage access is wrapped in
try/catch that degrades to defaults (Safari private mode), matching `exclusions.ts` /
`starter.ts`.

**Alternatives considered:**
- *Facet UI: dropdown/multiselect vs. chip toggles.* Chip toggles are more discoverable,
  match the app's existing `.chip` vocabulary, and need no open/close affordance. Chosen:
  chips. If the cuisine dimension (~15 values) makes the row too long, it can collapse
  behind a "more" affordance later — but start inline. (Open question on cuisine.)
- *Details mode as an accordion expansion of tiles vs. a distinct list render.* A distinct
  `renderRecipeDetailsList` is simpler, testable, and matches the "row per recipe" ask;
  reuses the same `recipe.html` link target as cards. Chosen: distinct renderer.
- *Filter in `present.ts` vs. a new module.* `present.ts` is for tiny value derivations;
  the filter/facet/prefs cluster is its own concern and browse-specific, so a dedicated
  `browse-state.ts` keeps `present.ts` focused. Chosen: new module.
- *Keep exclusions behavior.* We only remove the visible `· N hidden` **text**; excluded
  recipes stay hidden (the `exclusions` overlay is unchanged). Confirmed as an open question.

## Verified Assumptions

- Records carry `recipeCuisine` / `recipeCategory` / `suitableForDiet` / `keywords` — per
  the lexicon (`tests/fixtures/lexicons/exchange.recipe.recipe.json`) and confirmed on the
  live arecipe.bsky.social records (listRecords readback during the import work).
- The status line, `hiddenNote`, `withoutHidden`, and the two render paths (`showEntries`,
  `showStarterFeed`) all live in `src/pages/browse.ts` (read in full).
- Tile rendering + `firstImageCid` + `firstImageCredit` + the photo/placeholder helpers are
  in `src/recipes/view.ts` and `src/recipes/present.ts` (read in full).
- The `starter` e2e suite is **hermetic via `page.route`** stubbing `plc.directory/**` and
  each fake PDS (`tests/e2e/starter.spec.ts` read) — new wiring e2e follows this pattern.
- Storage keys in use: `theme`, `starter-pack-disabled`, `hidden-recipes` (localStorage),
  `last-find` (sessionStorage), `debug`. New keys (`browse-view-mode`, `browse-photos-only`,
  `browse-facets`) do not collide (grepped).
- `view.spec.ts` uses `@vitest-environment happy-dom`, so DOM render tests are supported.
- The existing `listRecords-exchange.recipe.recipe.json` fixture has `recipeCategory` and an
  `embed`, but **no** `recipeCuisine`/`suitableForDiet` and every record has an image — so
  filter/photos-only e2e needs a **new mixed fixture** with cuisine/diet variance and at
  least one image-less record (confirmed by inspecting the fixture).

## Documentation Impact

Grepped `README.md` and `docs/*.md` for `browse` / `starter pack` / `tiles` / `view mode`:
- `README.md:32` — one-line page inventory ("`index.html` (Browse)"). No per-feature detail;
  **no change required.**
- `docs/DESIGN.md`, `docs/BUILD-PLAN.md`, `docs/PHILOSOPHY.md` — architectural mentions
  (trust surface, future in-browser search, starter-pack overridability). None describe the
  Browse controls at a level this change makes stale. **No required update.**
- **Optional (ADVISORY):** a one-line note in `docs/DESIGN.md` that Browse now offers
  view-mode + label filtering could be added in Phase 7; not required. Recorded here so it's
  a conscious skip, not an oversight.

No files are added/renamed/removed in a way that other docs reference. (New source/test
files are not cross-referenced by docs.)

## Concurrency Map

**UI phases sequential; the ops phase is independent.** Phases 1–8 each read/write the same
small set of files (`browse-state.ts`, `browse.ts`, `view.ts`, `view.spec.ts`, `styles.css`,
`settings.ts`) and build on the seam/state introduced by the previous, so they are sequential
(write-set overlap, rejected for parallelism). **Phase 9 (record data hygiene)** has a
disjoint write-set (`spike/import/*` + the live PDS, no `src/*` overlap) and no shared ambient
state with the UI phases, so it *could* run in parallel or at any point; it is listed last for
simplicity, not dependency. All work happens on the `browse-view-filters` worktree.

Sequential spine: Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Phase 9 independent (any time).

## Phases

> **Isolation-trap note (read before executing):** Phases 2, 4, and 6 add pure logic /
> render functions that are unit-tested but **not yet reachable from the entry point**. They
> are deliberately paired with the very next wiring phase (3 wires 2; 5 wires 4; 7 wires 6),
> each of which carries an **e2e wiring test** that drives the built bundle. Do not treat a
> library phase as "done shipping" — its consuming wiring phase is the gate. Never skip the
> wiring phase because "the unit tests pass."

### Phase 0: Discovery — filter/toolbar UX prototype
**Goal:** Resolve the interaction design before committing the TDD phases. The filter UX is
genuinely uncertain (user: "we'll have to try a few things"), and getting the *data model*
wrong (diet-as-filter vs diet-as-preference) would ripple through Phases 2–7.
**Discovery tasks:**
- [ ] **D1: Which toolbar/filter arrangement fits?** Build a **throwaway** static mock
  (real starter-feed data via `spike/import/gather-feed.mjs`) showing 2–3 arrangements:
  (a) view-mode toggle + "photos only" + an ad-hoc **filter multiselect/dropdown on the same
  row as the search button**; (b) a top-level **"Only show me"** dietary-preference control,
  visually distinct from the transient filters; (c) cuisine/meal/tags as a single filterable
  dropdown vs. inline chips.
  - **Probe:** Generate the mock(s), view in a browser, pick the arrangement.
  - **Success criteria:** A chosen layout + a confirmed split of *which dimensions are a
    persisted personal preference* (diet) vs. *transient per-browse filters* (cuisine/meal/
    tags), plus where the diet preference is set (Browse toolbar vs. Settings).
  - **Disposition:** `throwaway` — the mock is deleted after the decision; the chosen design
    is built under TDD in Phases 2–7. (Discovery Exemption: the mock gets no tests.)
**Outputs fed back into the plan:** Update Phase 2's `BrowseState`/prefs shape to model diet
as a persisted preference and cuisine/meal as transient facets; update Phases 6/7 (and
possibly add a Settings touch-point) per the chosen UX; resolve Open Questions Q2 + the new
diet-preference question in the Review Log.
**Done when:** The arrangement and the preference/filter split are chosen, and Phases 2–7
have been adjusted to match. This is the only phase allowed to restructure later phases.

**DECISION (2026-07-08, from the prototype):**
- **Layout = compact bar (variant C):** a search row (handle input + Find), then a single
  control bar: `[Tiles | Details]` segmented toggle · `Photos only` toggle · `Meal ▾` ·
  `Cuisine ▾` · then right-aligned the count `N of M shown · V verified` with a
  `set dietary preference ↗` link beneath it.
- **Two separate dropdowns** — `Meal ▾` and `Cuisine ▾` (not one combined "Filters"). Each is
  a multi-select (grouped checkboxes), OR-within / AND-across dimensions.
- **No diet control on the Browse toolbar.** Dietary preference is set only in Settings; the
  Browse count area carries a `set dietary preference ↗` link to the Settings dietary section
  (arrow ↗ = "opens the setting"). `renderCurrent` still *applies* the stored diet preference.
- Prototype (`scratchpad/mock/`) disposition: **throwaway** — delete after build starts.

### Phase 1: Header polish + single render seam — ✅ SHIPPED (`a3d9ae9`)
**Delivered:** `renderCurrent()` seam with a `Current` record carrying `kind`
(`search`/`starter`) + `fetchedCount` + `statusSuffix` so both status strings
reconstruct faithfully (Pass 3 gap). `.browse-toolbar` > `.browse-count`
(right-aligned) holds the status + `set dietary preference ↗` link →
`./settings.html#diet-preference`. `hiddenNote` removed; `withoutHidden`
simplified to return `CachedRecipe[]`. `log.debug('browse', 'render', …)` added.
Wiring test + full hermetic suite (33 e2e, 144 unit) green; the exact-match race
test still passes (search string byte-identical).
**Goal:** Right-align the count, drop the `· N hidden` note, and refactor `browse.ts` so both
render paths funnel through one `renderCurrent()` that holds the current entries — the seam
every later toggle/filter hooks into. A visible `.browse-toolbar` container is added with the
count right-aligned inside it.
**Changes:**
- [ ] `src/pages/browse.ts` — introduce `let current: { entries: CachedRecipe[]; author?: string; authorsByDid?: Record<string,string> } | null` and a `renderCurrent()` that renders `current` via `renderRecipeList`; `showEntries` and `showStarterFeed` set `current` and call it. Remove `hiddenNote` usage from the displayed string (keep `withoutHidden` filtering). Wrap the count `<p data-testid=recipes-status>` in a `.browse-toolbar` bar, count right-aligned, with a `set dietary preference ↗` link (→ `./settings.html`, to the dietary section) beneath the count.
- [ ] `styles.css` — `.browse-toolbar` (flex row, count pushed right via `margin-left:auto` / `justify-content` + `.status` right-aligned).
- [ ] `tests/e2e/starter.spec.ts` — extend an existing assertion (or add one) that the status text has no "hidden" substring and the toolbar exists. (Editing this file is allowed — it is Browse's own suite, not the other agent's.)

> **Pass 3 status-string note (GAP found reading `browse.ts`):** the two paths emit **two different, non-interchangeable status strings** — search: `"N recipes cached (V verified)"` (uses a `fetchedCount` distinct from `entries.length`); starter: `"N starter pack recipes (V verified)"` **plus** `failed` (`— X, Y unavailable`) and `offline` (`· showing saved copies (offline)`) suffixes. The `current` shape above cannot reconstruct either string. Phase 1 must carry the status inputs, e.g. `current: { entries; author?; authorsByDid?; kind: 'search' | 'starter'; fetchedCount?: number; statusSuffix?: string }`, and `renderCurrent()` rebuilds the correct string from `kind` + verified-count of the (filtered) kept set. Without this, funnelling both paths through one seam silently loses the search-vs-starter wording and the failed/offline suffixes. The `set dietary preference ↗` link needs a fragment target — add `id="diet-preference"` to the Settings section in **Phase 8** and point the link at `./settings.html#diet-preference` (documented cross-phase so Phase 8 doesn't drop the anchor).
- [ ] `src/pages/browse.ts` — `log.debug('browse', 'render', { kind, shown, total })` inside `renderCurrent()` (gated debug level, matching the `log.debug('starter'|'social', …)` convention in `settings.ts`) so a "wrong count / empty feed" report is traceable from the console alone (the project's stated logging contract, `src/log.ts:1-5`).
**Call chain:** page load → `main()` → `showStarterFeed()` / form submit → `showEntries()` → `renderCurrent()` → `renderRecipeList` → DOM `.browse-toolbar` + `.recipe-grid`.
**Wiring test:** e2e (starter fixtures): load Browse, assert `[data-testid=recipes-status]` contains `starter pack recipes` and does **not** contain `hidden`, and `.browse-toolbar` is present with the status right-aligned (assert computed style or a marker class).
**Depends on:** none.
**Read-set:** `src/pages/browse.ts`, `src/recipes/view.ts`, `src/recipes/exclusions.ts`, `styles.css`, `tests/e2e/starter.spec.ts`.
**Write-set:** `src/pages/browse.ts`, `styles.css`, `tests/e2e/starter.spec.ts`.
**Shared-state contract:** No shared mutable state beyond the file write-set. Runs on the working tree; no git/process/network ambient state touched.
**Risks:** The two render paths diverge subtly (search passes `author`, starter passes `authorsByDid`); `renderCurrent` must carry both. Existing starter e2e asserts the old status string — update it, don't leave it asserting "hidden". **Regression trap (Pass 3):** `starter.spec.ts` lines 114/117 assert the *search-path* count with **exact** `toHaveText('3 recipes cached (3 verified)')` (not `toContainText`). Any change to the search-path count wording — including the toolbar wrap and the Phase 3 "N of M shown" variant — is a breaking assertion. Phase 1 must keep the unfiltered search string byte-identical (`N recipes cached (V verified)`), and re-run the race test after the seam refactor to confirm it still passes.
**Done when:**
1. **Behavioral:** Loading Browse shows the count right-aligned in a toolbar with no "hidden" text; a subsequent handle search re-renders through the same seam.
2. **Verification:** `npx playwright test tests/e2e/starter.spec.ts` (green, incl. the new no-"hidden"/toolbar assertion).
**Validation:** Moderate. Wiring e2e + run `npm run serve` and eyeball the toolbar alignment in the real bundle (light + dark theme).

### Phase 2: Browse-state core (pure) — ✅ SHIPPED (`fef5f29`)
**Delivered:** `src/recipes/diet-preference.ts` (shared store) + `src/pages/browse-state.ts`
(`recipeFacets` with `…Diet`-suffix strip + `side dish`→`side` normalization; `matchesFilter`
OR-within/AND-across + photos-only + diet AND'd across tokens; `availableFacets` distinct+sorted;
defensive `createBrowsePrefs`). `log.warn` on storage-catch per Pass 3. 18 unit tests; typecheck +
lint clean; full unit suite 162 green. No wiring this phase — Phase 3 is the gate.
**Goal:** The pure heart of the feature: extract a recipe's facets, evaluate a recipe against
a filter state, and load/save browse preferences defensively. No DOM, no rendering.
**Data-model note (confirmed in walk-through):** dietary labels are a **persisted personal
preference set in Settings** (app-wide default), NOT a transient Browse filter. So there are
two stores: an app-wide **diet preference** (consumed by Browse, written by Settings) and
Browse's **transient facets** (cuisine + meal category + tags). `matchesFilter` applies
both.
**Changes:**
- [ ] `src/recipes/diet-preference.ts` — **shared, app-wide** store (used by both Browse and
  Settings): `type DietPreference = string[]` (selected diet tokens, e.g. `['dietVegetarian']`);
  `createDietPreference({storage?})` with `load()/save()` (defensive try/catch, key
  `diet-preference`); empty = "no preference / show all".
- [ ] `src/pages/browse-state.ts` — `recipeFacets(value): { cuisine: string|null; category: string|null; diet: string[]; hasImage: boolean }` (diet tokens stripped via `#`-split **and normalized**: drop a trailing `Diet` so `dietLowCarbDiet`→`dietLowCarb`, `dietGlutenFreeDiet`→`dietGlutenFree`; canonicalize the `side dish`→`side` category; this makes filtering/grouping robust to the malformed wild records we can't edit — e.g. recipe.exchange's Gingerbread Cookies); `hasImage` from `firstImageCid`; `type BrowseState = { view: 'tiles'|'details'; photosOnly: boolean; facets: { cuisine: string[]; category: string[] } }` (**transient**, no diet); `matchesFilter(value, { state, diet }): boolean` — OR-within-dimension / AND-across-dimensions for the transient facets, AND photos-only, AND the app-wide `diet` preference (recipe must satisfy every selected diet token); `createBrowsePrefs({storage?})` (keys `browse-view-mode`, `browse-photos-only`, `browse-facets`); `availableFacets(entries): { cuisine: string[]; category: string[] }` (distinct, sorted).
- [ ] `tests/unit/recipes/diet-preference.spec.ts` — round-trip; empty = match-all; private-mode degradation.
- [ ] `tests/unit/pages/browse-state.spec.ts` — table-driven: facet extraction from real record shapes **incl. normalization** (`dietGlutenFreeDiet`→`dietGlutenFree`, `side dish`→`side`); predicate truth table (empty state matches all; single-dimension OR; cross-dimension AND; photos-only excludes image-less; **diet preference intersects** — a vegetarian preference drops non-vegetarian recipes); prefs round-trip; `availableFacets` distinct+sorted.

> **Pass 3 observability note:** the defensive `catch` in `createDietPreference`/`createBrowsePrefs` must not swallow silently — call `log.warn('browse', 'prefs load/save failed', { key, error })` in the catch before degrading to defaults. `warn` always emits (not debug-gated — `src/log.ts:2`), matching the project contract that "a backendless failure is debuggable from the console alone". This is a code detail, not a new test: the round-trip/degradation tests already inject a throwing storage; assert only the returned default, not the log call (behavior, not implementation). TDD ordering unchanged — the throwing-storage test is written RED first.

> Note: 4 files here nudges the split threshold, but `diet-preference.ts` is small and its
> spec is tiny; the cluster is one cohesive "browse-state + shared diet pref" unit. If it
> feels heavy in execution, land `diet-preference.ts` + its spec as a separate sub-step first.
**Call chain:** (library) consumed by Phase 3 (`matchesFilter`/prefs), Phase 5 (view/prefs), Phase 7 (facets). Not wired to an entry point in this phase — see the isolation-trap note; Phase 3 provides the first live chain.
**Wiring test:** none in this phase (pure library). Its first wiring test is Phase 3's e2e.
**Depends on:** none (imports `firstImageCid` from `present.ts`).
**Read-set:** `src/recipes/present.ts`, `tests/fixtures/lexicons/exchange.recipe.recipe.json` (for real shapes in tests).
**Write-set:** `src/pages/browse-state.ts`, `tests/unit/pages/browse-state.spec.ts`.
**Shared-state contract:** None beyond the write-set; pure functions + injectable storage.
**Risks:** Diet token stripping must handle both `exchange.recipe.defs#dietVegan` and any bare values; `availableFacets` must ignore `null`s. Predicate semantics (OR/AND) are the subtle part — the truth table is the guard.
**Done when:**
1. **Behavioral:** Given a set of records and a filter state, `matchesFilter` selects exactly the intended subset per the OR/AND rules; prefs survive a save/load cycle and degrade to defaults under a throwing storage.
2. **Verification:** `npx vitest run tests/unit/pages/browse-state.spec.ts`.
**Validation:** Narrow. Unit tests are sufficient (pure logic).

### Phase 3: Photos-only toggle (wired) — ✅ SHIPPED (`bc9488e`)
**Delivered:** `.browse-controls` with a `Photos only` toggle pill; `renderCurrent` filters via
`matchesFilter` and reads `createDietPreference().load()` (empty default); filtered count
`N of M shown · V verified`, unfiltered strings preserved byte-identical (race test still green).
`createBrowsePrefs` persists the toggle. New `tests/e2e/browse.spec.ts` (routes mixed fixture to
arecipe, empty for other starter authors) + `listRecords-browse-mixed.json` — fixture CIDs use a
valid `$link` so `recomputeCid`/`CID.parse` succeeds (discovery below). Count edges asserted
(4→3→4, "3 of 4 shown"). Full hermetic suite 35 green.
**Discovery:** the mixed fixture initially rendered zero cards — `cache.put` recomputes the CID,
and `fromLexJson` runs `CID.parse` on each image `ref.$link`; a hand-mangled `$link` throws and
drops the record. Fix: use a real, parseable CID for image refs in fixtures. (The record-level
`cid` string can be arbitrary — it's only string-compared for `verified`.)
**Goal:** First live filter. A "Photos only" toggle in the toolbar that, when on, shows only
recipes with an image — applied through `renderCurrent()` so it works on both feed and search.
**Changes:**
- [ ] `src/pages/browse.ts` — add a photos-only toggle control to the toolbar; on change, persist via `createBrowsePrefs` and call `renderCurrent()`, which now filters `current.entries` through `matchesFilter({ state, diet })` before handing to the renderer. **`renderCurrent` reads the app-wide diet preference** (`createDietPreference().load()`, empty default = show all) and passes it in — so Browse honors the Settings diet preference from this phase on, even before the Settings UI (Phase 8) exists. Initialize the toggle from prefs on load.
- [ ] `styles.css` — `.browse-toggle` (pill/switch styling consistent with chips).
- [ ] `tests/e2e/browse.spec.ts` — **new** hermetic suite (routed fixtures, patterned on `starter.spec.ts`) with a mixed fixture where some records have an `embed` and one does not; assert toggling "Photos only" hides the image-less card and the count updates; assert the choice persists across reload. **Mutation-resistance (Pass 3):** assert the count at the *edges*, not one point — off = full count string (original wording), on = the filtered `N of M shown` string with N < M and N = (records that have an image). One image-less record in the fixture makes N and M differ so a "count never recomputes" mutation is caught.

> **Pass 3 count-string note:** this phase resolves the "N of M shown" open question. When **no** filter is active the string must stay byte-identical to the originals (`N starter pack recipes (V verified)` / `N recipes cached (V verified)`) — see the Phase 1 regression trap: `starter.spec.ts` exact-matches the search string. Switch to `N of M shown · V verified` only when a filter (photos-only / facet / diet) is active. Add a debug log `log.debug('browse', 'filter changed', { photosOnly })` in the toggle handler (console-traceability convention).
- [ ] `tests/fixtures/atproto/listRecords-browse-mixed.json` — **new** fixture: several records varying `recipeCuisine`/`recipeCategory`/`suitableForDiet` and image presence (one with no `embed`). Reused by Phases 5 and 7.
**Call chain:** toolbar toggle `change` → persist + `renderCurrent()` → `matchesFilter` (Phase 2) → `renderRecipeList` → DOM grid with image-less card removed.
**Wiring test:** the `tests/e2e/browse.spec.ts` "photos only hides image-less recipe" case — RED before wiring, GREEN after.
**Depends on:** Phase 1 (seam), Phase 2 (`matchesFilter`, prefs).
**Read-set:** `src/pages/browse-state.ts`, `src/pages/browse.ts`, `src/recipes/view.ts`.
**Write-set:** `src/pages/browse.ts`, `styles.css`, `tests/e2e/browse.spec.ts`, `tests/fixtures/atproto/listRecords-browse-mixed.json`.
**Shared-state contract:** localStorage key `browse-photos-only` (namespaced, defensive). No other ambient state.
**Risks:** 4 files — at the split threshold; the fixture + e2e are a unit (the test needs the fixture), so they belong together. If it feels oversized in execution, the fixture can be pre-created as a tiny separate step. Count-update semantics interact with the "filtered count" open question (below).
**Done when:**
1. **Behavioral:** With "Photos only" on, image-less recipes disappear from Browse and the shown count reflects the filtered set; the toggle state persists across reload.
2. **Verification:** `npx playwright test tests/e2e/browse.spec.ts -g "photos"`.
**Validation:** Moderate. e2e wiring + manual `npm run serve` check that the toggle filters the real feed.

### Phase 4: Details list renderer (view) — ✅ SHIPPED (`7e13878`)
**Delivered:** `renderRecipeDetailsList` → `.recipe-rows > a.recipe-row` (thumb via `photoWrapEl`,
`.card-title`, `.recipe-row-text` description, `.recipe-row-chips` from `recipeFacets` with the
`diet` prefix stripped). Row is the anchor (no nested links); ALTERED stamp/warning like cards;
`recipe-item` testid shared so `renderCurrent` counts are view-agnostic. 6 happy-dom tests.
**Goal:** The Details view render function — one row per recipe (thumbnail + name +
description + label chips), each row linking to `recipe.html` like a card. Render only;
wired in Phase 5.
**Changes:**
- [ ] `src/recipes/view.ts` — `renderRecipeDetailsList(entries, options): HTMLElement` producing `.recipe-rows > a.recipe-row` (reusing `photoWrapEl`/placeholder for the thumb, `recipePageHref` for the link, `value.text` for the description, and small label chips from `recipeFacets`). Keep the altered/verified trust surface consistent with cards.
- [ ] `styles.css` — `.recipe-rows` / `.recipe-row` (flex: thumb left, text block right; responsive).
- [ ] `tests/unit/recipes/view.spec.ts` — a `describe('renderRecipeDetailsList')`: renders one row per entry; each row is an anchor with the correct `recipe.html?u=…&by=…` href; shows name + description; image-less entry falls back to the placeholder; label chips present.
**Call chain:** (render library) consumed by Phase 5's toolbar view-mode switch. Not wired here.
**Wiring test:** none this phase; Phase 5 provides the e2e.
**Depends on:** Phase 2 (`recipeFacets` for chips).
**Read-set:** `src/recipes/present.ts`, `src/pages/browse-state.ts`, `src/recipes/cache.ts` (types).
**Write-set:** `src/recipes/view.ts`, `styles.css`, `tests/unit/recipes/view.spec.ts`.
**Shared-state contract:** None; pure DOM construction in happy-dom.
**Risks:** `view.ts` and `view.spec.ts` are also touched by Phase 6 — sequential ordering avoids conflict. Row markup must not nest anchors (same lesson as the image-credit overlay): the row is the anchor; no inner links.
**Done when:**
1. **Behavioral:** `renderRecipeDetailsList` produces a list of linked rows with image, name, description, and label chips, matching card link/trust behavior.
2. **Verification:** `npx vitest run tests/unit/recipes/view.spec.ts`.
**Validation:** Narrow→Moderate. Unit tests + a screenshot pass once wired (Phase 5).

### Phase 5: View-mode toggle wiring (wired) — ✅ SHIPPED (`f7a0b4b`)
**Delivered:** `.segmented` [Tiles | Details] buttons (`view-tiles`/`view-details` testids,
`aria-pressed` + `--active` class); `renderCurrent` selects `renderRecipeDetailsList` vs
`renderRecipeList` from `state.view`; `setView` persists + reflects + re-renders from held
`current.entries`. e2e: default Tiles, Details renders `.recipe-rows`, persists across reload,
composes with photos-only. Full hermetic suite 37 green.
**Goal:** A Tiles/Details segmented toggle in the toolbar that switches which renderer
`renderCurrent()` uses, persisted across sessions and applied to both render paths.
**Changes:**
- [ ] `src/pages/browse.ts` — add the view-mode segmented control to the toolbar; `renderCurrent()` chooses `renderRecipeList` vs `renderRecipeDetailsList` from `BrowseState.view`; persist on change; initialize from prefs. Log `log.debug('browse', 'view mode', { view })` on change (console-traceability convention).
- [ ] `tests/e2e/browse.spec.ts` — add a case: default is Tiles (`.recipe-grid`); clicking Details renders `.recipe-rows`; the mode persists across reload.
**Call chain:** toolbar view toggle `click` → persist + `renderCurrent()` → `renderRecipeDetailsList` (Phase 4) → DOM `.recipe-rows`.
**Wiring test:** the `tests/e2e/browse.spec.ts` "switch to Details renders rows" case.
**Depends on:** Phase 1 (seam), Phase 2 (prefs), Phase 4 (renderer).
**Read-set:** `src/pages/browse-state.ts`, `src/recipes/view.ts`, `src/pages/browse.ts`.
**Write-set:** `src/pages/browse.ts`, `tests/e2e/browse.spec.ts`.
**Shared-state contract:** localStorage key `browse-view-mode`. No other ambient state.
**Risks:** The toggle must re-render without refetching (use held `current.entries`). Details + photos-only must compose (both flow through `renderCurrent`).
**Done when:**
1. **Behavioral:** Toggling Tiles/Details switches the layout live; the choice persists; photos-only still applies in Details.
2. **Verification:** `npx playwright test tests/e2e/browse.spec.ts -g "Details"`.
**Validation:** Moderate. e2e + manual serve check in both themes.

### Phase 6: Facet dropdown renderer (view) — ✅ SHIPPED (`14fe0d5`)
**Delivered:** `renderFacetDropdown({dimension,label,available,selected})` → `<details
class="facet-dd" name="browse-facet">` + `<summary>Meal ▾</summary>` + checkbox panel; each
`input` carries `data-dimension`/`data-value`, checked per `selected`; returns `null` when
`available` is empty. `.facet-dd` popover CSS (absolute panel, light + dark). 4 happy-dom tests.
**Goal:** Render the two multi-select filter dropdowns — `Meal ▾` and `Cuisine ▾` (per the
Phase 0 decision: two separate dropdowns, not chips), reflecting selected state. Render only;
wired in Phase 7.
**Changes:**
- [ ] `src/recipes/view.ts` — `renderFacetDropdown(dimension, available, selected): HTMLElement` producing a `<details class="facet-dd" name="browse-facet">` with a `<summary>` label (e.g. "Meal ▾") and a panel of checkbox options; each option carries `data-dimension` + `data-value`, checked per `selected`. Called once per dimension (meal, cuisine). **Interaction contract (from Phase 0):** (a) shared `name="browse-facet"` so only one of Meal/Cuisine is open at a time (native exclusive accordion); (b) ticking an option must NOT collapse the panel — multi-select is cumulative, so the wiring (Phase 7) updates the filter + count + list *without* rebuilding the dropdown; (c) clicking outside the open panel (or re-clicking its summary) closes it.
- [ ] `styles.css` — `.facet-dd` / `.facet-dd-panel` (native `<details>` popover styling, consistent with the app; light + dark).
- [ ] `tests/unit/recipes/view.spec.ts` — `describe('renderFacetDropdown')`: renders one checkbox per available value; selected values are `checked`; empty `available` → the dropdown is omitted (or renders disabled); summary shows the dimension label.
**Call chain:** (render library) consumed by Phase 7. Not wired here.
**Wiring test:** none this phase; Phase 7 provides the e2e.
**Depends on:** Phase 2 (`availableFacets` shape, `BrowseState`).
**Read-set:** `src/pages/browse-state.ts`.
**Write-set:** `src/recipes/view.ts`, `styles.css`, `tests/unit/recipes/view.spec.ts`.
**Shared-state contract:** None.
**Risks:** Cuisine dimension may have many values (open question on presentation). Chips are buttons, not links — no nested-anchor issue.
**Done when:**
1. **Behavioral:** `renderFacetDropdown` renders one `<details>` per dimension with one checkbox per available value, correct `checked` state per `selected`, the dimension label in the `<summary>`, and empty `available` → the dropdown omitted. (Pass 3: was "renderFacetChips" — stale name from the pre-Phase-0 chips design; the Phase 0 decision is two dropdowns.)
2. **Verification:** `npx vitest run tests/unit/recipes/view.spec.ts`.
**Validation:** Narrow→Moderate. Unit tests + screenshot once wired.

> **Note:** Phases 6–7 cover the **transient** filters only — cuisine + meal category (+
> tags). Dietary labels are NOT here; they are the app-wide "Only show me" preference set in
> Settings (Phase 8) and already applied by `renderCurrent` from Phase 3 on.

### Phase 7: Label filtering wiring (wired) + docs note — ✅ SHIPPED (`e172c99`)
**Delivered:** `.browse-facets` holds `Meal ▾` + `Cuisine ▾` built from
`availableFacets(withoutHidden(current.entries))` via `renderFacetDropdown`; `rebuildToolbarFacets`
runs on feed/search change (through `showCurrent`), never on facet change. Event-delegated
checkbox `change` updates `state.facets` + persists + `renderCurrent()` (count+list only → panel
stays open for multi-select). Document-level outside-click closes open dropdowns. `effectiveState`
intersects selected facets with what the current feed offers, so a stale selection is inert (kept
in state, not filtering to empty). OR-within / AND-across. Added the DESIGN.md browse-toolbar note
(scheduled here, not deferred). 4 e2e cases; full `npm test` gate green incl. the zero-auth
bundle-split test.
**Goal:** Wire the facet chips into the toolbar and `renderCurrent()`, computing available
facets from the current entries and applying `matchesFilter`; persist selections. Complete
the feature.
**Changes:**
- [ ] `src/pages/browse.ts` — build the `Meal ▾` + `Cuisine ▾` dropdowns from `availableFacets(current.entries)` (via `renderFacetDropdown`); on a dropdown checkbox `change`, update `BrowseState.facets`, persist, and refresh **only the count + list** (not the toolbar) so the open dropdown survives multi-select; add a document-level click handler that closes an open facet `<details>` on outside-click; initialize from prefs; recompute available facets whenever `current` changes (feed vs search). Structural re-render (rebuild toolbar) happens only on view-mode / photos-only / feed changes. Log `log.debug('browse', 'facets changed', { dimension, selected })` on change.
- [ ] `tests/e2e/browse.spec.ts` — add cases using `listRecords-browse-mixed.json`: selecting `vegetarian` narrows to vegetarian recipes; adding `breakfast` yields `vegetarian AND (breakfast)`; selecting two categories is OR within the dimension; selections persist across reload.
- [ ] `docs/DESIGN.md` — (ADVISORY, only if confirmed) one line noting Browse view-mode + label filtering.
**Call chain:** dropdown checkbox `change` → update `BrowseState.facets` + persist + `renderCurrent()` → `matchesFilter` (Phase 2) → active renderer → filtered DOM.
**Wiring test:** the `tests/e2e/browse.spec.ts` facet cases (RED before wiring, GREEN after).
**Depends on:** Phase 1 (seam), Phase 2 (facets/predicate/prefs), Phase 6 (chips render). Phase 3 for the shared mixed fixture.
**Read-set:** `src/pages/browse-state.ts`, `src/recipes/view.ts`, `src/pages/browse.ts`, `tests/fixtures/atproto/listRecords-browse-mixed.json`.
**Write-set:** `src/pages/browse.ts`, `tests/e2e/browse.spec.ts`, `docs/DESIGN.md` (conditional).
**Shared-state contract:** localStorage key `browse-facets`. No other ambient state.
**Risks:** Available facets differ between the starter feed and a handle search — must recompute on each `current` change, and prune selected facets that no longer exist (or keep them inert). Toolbar row could get long with all dimensions (open question).
**Done when:**
1. **Behavioral:** Selecting label chips narrows the visible recipes per OR-within / AND-across semantics, composes with photos-only and Details mode, and persists across reload.
2. **Verification:** `npx playwright test tests/e2e/browse.spec.ts` (full suite green) and `npm test` (whole hermetic gate) green.
**Validation:** Broad. Full e2e + `npm run serve` manual pass across both themes; confirm filtering works on both the starter feed and a live handle search; verify no auth code leaked into the Browse bundle (existing bundle-split test still green).

### Phase 8: Settings — "Only show me" dietary preference (wired) — ✅ SHIPPED (`6e7644e`)
**Delivered:** `section('Only show me', 'diet-preference')` with `id=diet-preference` (the Browse
↗ link target), a `starter-row` checkbox per `DIET_OPTIONS` bound to `createDietPreference`
load/save, `log.debug('diet','toggled')` on change; placed after the starter section. New
`DIET_OPTIONS` (normalized vocab) in `diet-preference.ts`. New `tests/e2e/settings.spec.ts` proves
persistence + the Settings→Browse cross-page filter; 1 unit test for the vocab. No new CSS (reuses
`.starter-row`). Full hermetic suite 43 green.
**Goal:** A dietary-preference control in Settings that writes the app-wide `diet-preference`
store; because `renderCurrent` (Phase 3) already reads it, setting it here filters Browse.
**Changes:**
- [ ] `src/pages/settings.ts` — add an "Only show me" section (multi-select of diet tokens:
  vegetarian, vegan, gluten-free, …) bound to `createDietPreference` load/save; consistent
  with the existing starter-pack settings controls. **Confirmed pattern (Pass 3, read `settings.ts` in full):** reuse the existing `section(title, testid)` helper → `section('Only show me', 'diet-preference')`, then `starter-row`-style `<label>` + `<input type=checkbox>` rows exactly like the Starter pack (`settings.ts:103-127`) and Social (`:129-148`) sections; on `change` call `createDietPreference().save(...)` and `log.debug('diet', 'toggled', { token, on })` (mirrors `log.debug('starter'|'social', 'toggled', …)`). Insert into the final `content.append(build, updates, starter, social, …)` list (recommend after `social`). **Add `box.id = 'diet-preference'`** (or set it on the `<section>`) so the Browse `set dietary preference ↗` link (`./settings.html#diet-preference`, Phase 1) lands on it.
- [ ] `styles.css` — minimal styling reusing settings/chip patterns (may be no-op if reusing).
- [ ] `tests/e2e/settings.spec.ts` — **NEW file** (Pass 3: there is no `settings.spec.ts` today — Settings behavior is currently exercised inside `starter.spec.ts:55-66,120-127`; the cross-page diet test warrants its own file). Setting a diet preference persists across reload; and an integration assertion that with a vegetarian preference set, Browse hides non-vegetarian recipes (drive via the `listRecords-browse-mixed.json` routed fixture from Phase 3 so vegetarian/non-vegetarian variance exists).
**Call chain:** Settings control `change` → `createDietPreference().save()` → (localStorage
`diet-preference`) → Browse `renderCurrent` reads it → `matchesFilter` drops non-matching.
**Wiring test:** e2e — set vegetarian in Settings, navigate to Browse, assert non-vegetarian
recipes are gone (RED before wiring, GREEN after).
**Depends on:** Phase 2 (`diet-preference.ts`), Phase 3 (Browse reads the preference).
**Read-set:** `src/recipes/diet-preference.ts`, `src/pages/settings.ts`.
**Write-set:** `src/pages/settings.ts`, `styles.css`, `tests/e2e/settings.spec.ts` (**new file**).
**Shared-state contract:** localStorage key `diet-preference` (app-wide; also read by Browse).
No other ambient state.
**Risks:** Cross-page state (Settings writes, Browse reads) — the e2e must exercise both
pages to prove the wiring, not just that Settings persists. `settings.ts` structure confirmed
in Pass 3 (see Changes) — the reusable `section`/`starter-row` pattern is in place; no
structural unknown remains.
**Done when:**
1. **Behavioral:** Setting "Only show me: vegetarian" in Settings makes Browse show only
   vegetarian recipes on next visit; clearing it restores all.
2. **Verification:** `npx playwright test tests/e2e/settings.spec.ts -g "diet"`.
**Validation:** Broad (cross-page). e2e across Settings→Browse + manual serve check.

### Phase 9: Record data hygiene (ops, independent) — ✅ SHIPPED (`c33dbd0`)
**Delivered:** `spike/import/fix-metadata.mjs` (pure `correctRecordValue` + guarded network
runner) + `fix-metadata.test.mjs` (4 `node --test` cases). Live run (2026-07-08): dry-run
previewed 1 correction of 41 records; live `putRecord` corrected `3mq3m2skev52f` ("Greek
Cucumber Tomato Feta Salad") `recipeCategory` `side dish`→`side`; readback confirmed 0 `side dish`
remain, `createdAt` preserved, `updatedAt` bumped to `2026-07-08T19:32:21Z`; a second dry-run
reported 0 corrections (idempotent). No `suitableForDiet` tokens needed fixing on the owned
account. `.env` was copied into the worktree only for the run and removed afterward.
**Goal:** Correct the malformed metadata on records **we own** (arecipe.bsky.social) so the
raw data is clean, not just normalized at display time. Foreign records we cannot edit
(recipe.exchange's Gingerbread Cookies) are covered only by the Phase 2 code normalization —
documented, not fixed.
**Changes:**
- [ ] `spike/import/fix-metadata.mjs` — **new** ops script (non-production, matches the import
  tooling): audit arecipe.bsky.social `exchange.recipe.recipe` records for `recipeCategory ==
  'side dish'` (→ `side`) and any `suitableForDiet` token ending in `Diet` (→ strip suffix);
  `putRecord` the corrections (preserve `createdAt`, bump `updatedAt`), idempotent, `--dry-run`
  first. Currently: 1 record (the seed "Greek Cucumber Tomato Feta Salad", `side dish`→`side`).
- [ ] `spike/import/fix-metadata.test.mjs` — unit test the pure transform (category/diet
  correction) with `node --test`, RED→GREEN, before the network runner.
**Call chain:** `node fix-metadata.mjs` → login (app pw) → listRecords → correct in memory →
putRecord. Ops entry point, not the app.
**Wiring test:** dry-run prints the 1 planned correction; post-run, a listRecords readback
shows no `side dish` category on the account.
**Depends on:** none (independent of the UI phases). Uses `.env` creds like the import.
**Read-set:** live arecipe.bsky.social records; `spike/import/*` (pattern reference).
**Write-set:** `spike/import/fix-metadata.mjs`, `spike/import/fix-metadata.test.mjs`; live PDS
records (own account only).
**Shared-state contract:** Writes to the arecipe.bsky.social PDS via app-password (guarded to
that account); localStorage untouched; no git/process state. **Independent of the UI phases'
write-set** (`src/*`, `styles.css`, `tests/*`) — could run before, after, or in parallel with
them; listed last for simplicity. **Parallel-safety invariant (Pass 3):** the live-PDS write
is *not* observed by any UI phase because all UI e2e is **hermetic** — `page.route` stubs
`plc.directory/**` and every PDS with fixtures (`starter.spec.ts`, `browse.spec.ts`), never
hitting arecipe.bsky.social. So even the display-time normalization tests (Phase 2) and the
mixed-fixture e2e (Phases 3/5/7) are insensitive to whether Phase 9 has run. Invariants: does
not touch the working tree's `src/*`/`tests/*`/`styles.css`; does not run `git checkout`/`stash`/
`rebase`; binds no ports; the only mutation is `putRecord` on the guarded account.
**Re-entry verification (only if actually parallelized):** worktree HEAD unchanged from
pre-dispatch SHA; `git status` shows only the two `spike/import/*` files modified; a
post-run `listRecords` readback shows the corrected `recipeCategory: "side"` and no
`…Diet`-suffixed diet token on the account. (Executed sequentially/last as planned, no
re-entry check is required.)
**Risks:** Outward, hard-to-reverse writes to the live account — dry-run + idempotent +
preserve `createdAt`, same discipline as the import. Only the seed is affected today.
**Done when:**
1. **Behavioral:** The seed record on arecipe.bsky.social carries `recipeCategory: "side"`;
   no owned record has a malformed diet token.
2. **Verification:** `node spike/import/fix-metadata.mjs --dry-run` then live readback via
   listRecords shows the corrected value.
**Validation:** Moderate. Unit test (pure transform) + dry-run review + live readback.

## Open Questions

- [CONFIRMED: PHASE-GATED (Phase 3)] When filters are active, should the count read
  `N of M shown` (filtered/total) instead of `M starter pack recipes (V verified)`?
  *Rationale: filtering changes the visible set; showing both the filtered and total counts
  is the honest default, but it changes the exact string the user specified. Recommend
  `N of M shown · V verified` when any filter is active, and the original string when not.*
- [CONFIRMED: resolved-in-Phase-0] Which label dimensions get chips, and how is the
  ~15-value **cuisine** dimension presented? *User reframed: transient filters (cuisine/meal/
  tags) as a multiselect/dropdown on the search-button row; presentation to be chosen by the
  Phase 0 prototype rather than decided on paper.*
- [CONFIRMED: BLOCKING → resolved] Model dietary labels as a persisted personal "Only show
  me" preference, distinct from transient filters? **Yes** — confirmed in walk-through.
  Location: **Settings** (app-wide default), read by Browse. Reflected in Phase 2 (shared
  `diet-preference.ts`), Phase 3 (Browse reads it), Phase 8 (Settings UI).
- [CONFIRMED: resolved-in-Pass-3] `src/pages/settings.ts` structure. *Resolved: read in full
  during Pass 3. Reusable `section(title, testid)` helper + `starter-row` checkbox pattern
  (`settings.ts:103-148`); the diet section mirrors Starter pack / Social. No settings.spec.ts
  exists — Phase 8 adds one (settings is currently tested inside `starter.spec.ts`). Anchor
  `id=diet-preference` needed for the Browse ↗ link. Folded into Phase 8's Changes.*
- [CONFIRMED: ADVISORY] Facet semantics OR-within-dimension / AND-across-dimensions. *Accepted as recommended.*
- [CONFIRMED: ADVISORY] Default view mode = Tiles, photos-only = off, persistence in `localStorage`. *Accepted as recommended.*
- [CONFIRMED: ADVISORY] Keep hiding `exclusions` recipes, only removing the visible `· N hidden` note. *Accepted as recommended.*
- [CONFIRMED: ADVISORY] Add the one-line `docs/DESIGN.md` note in Phase 7. *Accepted as recommended.*

## Review Log

### Pass 1: Plan development — 2026-07-08
Built the base: problem, reasoning (label data already on records; pure client-side
filtering; test-layer split; single render seam; facet semantics; localStorage persistence),
verified assumptions (grounded in browse.ts/view.ts/present.ts/exclusions.ts/starter.ts and
the lexicon + live readback), documentation impact (grepped — no required doc change),
concurrency map (all sequential, write-set overlap), 7 TDD-ordered phases, and 6 open
questions.

### Pass 2: Gap Analysis — 2026-07-08
**Found:**
- Two render paths (`showEntries`, `showStarterFeed`) — a filter/view wired into only one
  would silently fail on the other. → Added the `renderCurrent()` seam to **Phase 1** so
  both paths funnel through one place that later phases hook.
- Toggles/filters must re-render from **held entries** without refetching. → `browse.ts`
  keeps `current`; toggles call `renderCurrent()`. Recorded in Phases 1/3/5/7.
- The existing `listRecords` fixture has no cuisine/diet variance and every record has an
  image, so photos-only and facet e2e can't exercise real variance. → Added a **new mixed
  fixture** in Phase 3, reused by Phases 5/7.
- Available facets differ between the starter feed and a handle search. → Phase 7 recomputes
  `availableFacets` on every `current` change and handles now-absent selected facets.
- Nested-anchor hazard in Details rows / chips (the row is a link). → Called out in Phases 4
  and 6 (chips are buttons; rows carry no inner links).
- Isolation-trap risk: Phases 2/4/6 are library/render-only. → Added the explicit
  isolation-trap note and paired each with its wiring phase (3/5/7) carrying the e2e wiring
  test; documented that the wiring phase is the gate.
- Existing `starter.spec.ts` asserts the old status string incl. "hidden". → Phase 1 updates
  that assertion rather than leaving it stale.
**Concurrency:**
- No changes — map confirmed all-sequential (write-sets overlap on `browse.ts`/`view.ts`/
  `styles.css`; no parallel candidates).
**Changed:**
- Phase 1 scope expanded from "header polish" to "header polish + single render seam +
  toolbar container" (the seam is the foundation the whole feature hangs on).
- Phase 3 gained the mixed fixture as a first-class change.
- Added Documentation Impact ADVISORY note handling to Phase 7.
**Confirmed:**
- Pure-logic-in-`browse-state.ts` + render-in-`view.ts` + wiring-in-`browse.ts` split matches
  the repo's existing test layering and the hermetic e2e pattern.
- No PDS/lexicon/write-path change needed — feature is read/derive/render only.
- Stays entirely off the other agent's `src/social/*` and `tests/**/social|comments` files.

### Design refinement (walk-through, Q2) — 2026-07-08
**Found:**
- User reframed the filter UX: (1) transient filters (cuisine/meal/tags) as a
  **multiselect/dropdown on the same row as the search button**; (2) dietary labels as a
  **persisted personal "Only show me" preference** ("what you eat" → a standing default),
  distinct from transient filters; (3) "we'll have to try a few things" — the layout is
  uncertain and should be prototyped.
**Changed:**
- Added **Phase 0: Discovery** to prototype 2–3 toolbar/filter arrangements as a throwaway
  mock (Discovery Exemption — no TDD on the spike), feeding the decision back into Phases 2–7.
- Q2 marked resolved-in-Phase-0; added a **BLOCKING (before Phase 2)** open question on
  modeling diet as a persisted preference vs. a transient filter (it changes `BrowseState`).
- Noted a possible Settings touch-point for the diet preference (scope confirmed in Phase 0).
**Concurrency:** no changes — still all sequential (Phase 0 precedes the spine).
**Confirmed:**
- The preference/filter split is the key data-model decision; resolving it in Phase 0 before
  Phase 2 avoids reworking `browse-state.ts`.

> **Note (2026-07-08):** `src/recipes/view.ts` placeholder now uses a themed no-meal standin
> (`no-meal-light/dark.png`) instead of the wordmark logo — the Details renderer (Phase 4)
> reuses `photoWrapEl`/`placeholderEl`, so it inherits this automatically; no plan change.

### Diet-model decision + Settings phase — 2026-07-08
**Found:** User confirmed diet = persisted personal "Only show me" preference set in
**Settings** (app-wide), separate from transient cuisine/meal filters.
**Changed:**
- Phase 2 now defines a shared `src/recipes/diet-preference.ts` store; `BrowseState.facets`
  drops diet (transient = cuisine + meal only); `matchesFilter` takes `{ state, diet }`.
- Phase 3 `renderCurrent` reads the diet preference (empty default) so Browse honors it from
  the first wired filter on.
- Added **Phase 8: Settings "Only show me" dietary preference** (write side) with a
  cross-page Settings→Browse e2e wiring test.
- Phases 6–7 scoped explicitly to transient filters (cuisine/meal/tags), diet excluded.
- Added a PHASE-GATED question to read `settings.ts` structure before Phase 8.
**Concurrency:** no changes — still sequential (Phase 8 depends on 2+3).

### Phase 0 prototype refinements — 2026-07-08
**Found (from driving the prototype):**
- Chose **compact bar (C)**; split filters into **separate Meal ▾ and Cuisine ▾ dropdowns**;
  removed diet from the toolbar (Settings-only) with a `set dietary preference ↗` link by the
  count. (Recorded in the Phase 0 DECISION block; Phases 1/6/7 updated.)
- Dropdown interaction: multi-select must keep the panel open (cumulative), only one of the
  two open at a time, close on outside-click / summary re-click. The naive "rebuild toolbar
  on every change" collapses the panel — so Phase 7 refreshes count+list only on facet
  change and rebuilds structurally only on view/photos/feed changes. Recorded in Phase 6's
  interaction contract and Phase 7's changes.
**Changed:**
- Added **Phase 9: Record data hygiene (ops)** to fix the 1 owned malformed record (seed's
  `side dish`→`side`); folded display-time normalization into Phase 2's `recipeFacets`
  (`…Diet` suffix strip, `side dish`→`side`) so foreign records we can't edit
  (recipe.exchange's Gingerbread Cookies) still group/filter correctly.
- Concurrency Map updated: UI phases 0–8 sequential; Phase 9 independent (disjoint
  `spike/import` + PDS write-set).
**Concurrency:** Phase 9 flagged independent; UI spine unchanged.

### Branch/worktree isolation — 2026-07-08
This feature is developed on branch **`browse-view-filters`** in a git **worktree** at
`/Users/cpettet/git/chasemp/CroftC/arecipe-browse-filters`, created off `main` at `e1449d3`.
Rationale: another agent is actively committing to `main` in the primary working directory
(`~/git/chasemp/CroftC/arecipe`), so a plain in-place branch switch would move HEAD under
them. The worktree isolates this work; it will be merged into `main` locally and pushed when
ready (per user). All Phase 0–8 file paths above are relative to the worktree.

### Pass 3: Quality Gates — 2026-07-08
Spot-checked the worktree (`browse-view-filters` @ `29537f6`): `browse.ts`, `present.ts`,
`view.ts`, `settings.ts`, `starter.spec.ts`, `src/log.ts` read; all touch-points exist,
new files (`browse-state.ts`, `diet-preference.ts`, `listRecords-browse-mixed.json`,
`fix-metadata.mjs`) correctly absent. Applied additively — no phase reordering.
**TDD ordering:**
- Confirmed every phase is test-first and every *wiring* phase (1/3/5/7/8) carries an e2e
  wiring test that drives the built bundle; library phases (2/4/6) are explicitly gated by
  their consuming wiring phase (isolation-trap note holds). No changes needed to the ordering.
- Added mutation-resistance edges to Phase 3's count e2e (assert full-count vs
  `N of M shown` at both edges, N < M via the image-less fixture record) so a
  "count never recomputes" mutation is caught rather than surviving a single-point assertion.
- Fixed a stale test name in Phase 6 Done-when (`renderFacetChips` → `renderFacetDropdown`,
  the post-Phase-0 two-dropdown design) and named the specific behaviors (checked state,
  summary label, empty-available omission).
- Noted logging assertions stay behavior-only (assert the degraded default, not the log call).
**Observability:**
- The plan had **zero** logging despite `src/log.ts` being a first-class project convention
  ("a backendless failure is debuggable from the console alone"; warn/error always emit,
  debug/info gated by `?debug`). Added, matching the existing `log.debug('starter'|'social',
  'toggled', …)` / `log.warn('build', …)` usage: `log.warn` in the prefs modules' storage
  catch (Phase 2, before degrading to defaults), and `log.debug('browse', …)` on
  render/filter/view/facet changes (Phases 1/3/5/7) and `log.debug('diet', …)` on the
  Settings toggle (Phase 8).
**Debugging readiness:**
- Surfaced a **status-string reconstruction gap** in Phase 1: `renderCurrent`'s `current`
  shape could not rebuild the two distinct status strings (search `N recipes cached` +
  `fetchedCount`, starter `N starter pack recipes` + failed/offline suffixes). Extended the
  `current` shape to carry `kind`/`fetchedCount`/`statusSuffix`.
- Surfaced a **regression trap**: `starter.spec.ts:114/117` exact-matches the search count via
  `toHaveText`; flagged that Phase 1 must keep the unfiltered search string byte-identical and
  re-run the race test after the seam refactor, and that Phase 3's `N of M shown` variant must
  only apply when a filter is active.
- Per-phase commit checkpoints + phase-scoped e2e already isolate which phase broke; unchanged.
**Validation calibration:**
- Every phase declares a strategy calibrated to scope (Narrow for pure logic, Moderate for
  wired UI, Broad for the cross-page Settings→Browse and full-suite Phase 7). Phase 9's live
  irreversible PDS write is validated by dry-run + `listRecords` readback (the external check),
  which is the right tier despite the "Moderate" label. No recalibration needed.
- Phase 0 (done): `throwaway` disposition declared and honored; discovery tasks were concrete
  and their outputs are wired into Phases 1/2/6/7/8 and the Review Log.
**Concurrency honesty:**
- Concurrency Map accounts for all phases (0–8 sequential spine; 9 independent). Re-verified
  write-set disjointness after Pass 3 edits: UI phases write `src/*`/`styles.css`/`tests/*`;
  Phase 9 writes `spike/import/*` + the live PDS — disjoint. Sequential spine is genuinely
  dependency-bound (4 and 6 share `view.ts`; 4 depends on 2; no missed parallelism worth
  restructuring). Converted Phase 9's contract from a files-only claim to explicit
  **invariants** and added the key one: hermetic UI e2e (`page.route` fixtures) never observes
  the live PDS, so Phase 9's write cannot perturb any UI phase's tests. Added a re-entry
  verification checklist for the (optional) parallelized case.
**Documentation impact:**
- Documentation Impact section present and honest (grepped; no required doc change; the one
  advisory `docs/DESIGN.md` line is scheduled in Phase 7, not a deferred docs phase). New
  source/test files are not doc-cross-referenced — verified. No change needed.
**Coherence:**
- Plan still solves the original 5-point ask; Phases 8–9 are justified extensions (diet
  preference = ask #3; Phase 9 = the normalization discovery) recorded as CONFIRMED. Resolved
  the Phase 8 `settings.ts`-structure open question during Pass 3 (read in full): the
  `section`/`starter-row` pattern is reusable, no `settings.spec.ts` exists today (settings is
  tested inside `starter.spec.ts`), and the ↗ link needs an `id=diet-preference` anchor — all
  folded into Phase 8.
**Confirmed ready:** yes — no BLOCKING items remain; all open questions are CONFIRMED. Phase 3
and Phase 8 carry PHASE-GATED count-string / anchor details now written into those phases.

### Plan close-out — 2026-07-08
**Shipped:** The Browse page now carries a compact toolbar: a Tiles/Details view toggle, a
"Photos only" toggle, and transient `Meal ▾` / `Cuisine ▾` multi-select filter dropdowns (OR
within a dimension, AND across), with a right-aligned count and a `set dietary preference ↗`
link (the `· N hidden` note is gone). All controls persist in `localStorage` and re-render
through one `renderCurrent()` seam that works on both the starter feed and handle-search
results. A shared app-wide "Only show me" dietary preference lives in Settings
(`#diet-preference`) and filters Browse cross-page. New modules: `src/pages/browse-state.ts`
(`recipeFacets`/`matchesFilter`/`availableFacets`/`createBrowsePrefs`) and
`src/recipes/diet-preference.ts` (`createDietPreference` + `DIET_OPTIONS`); a Details renderer
(`renderRecipeDetailsList`) and facet-dropdown renderer (`renderFacetDropdown`) in
`src/recipes/view.ts`. Commits `a3d9ae9` (P1) → `c33dbd0` (P9) on `browse-view-filters`
(not pushed). Feature is read/derive/render only — no PDS/lexicon/write-path change. Phase 9
ops additionally corrected the one owned malformed live record (`side dish`→`side`). Gate:
lint + typecheck + 172 unit + 43 hermetic e2e (incl. the zero-auth bundle-split) green.
**Stopped or skipped:** Nothing. All 9 phases shipped. The `docs/DESIGN.md` advisory note was
included (Phase 7). No work deferred to a backlog.
**Discoveries:** (1) The mixed e2e fixture initially rendered zero cards — `cache.put`
recomputes each record's CID and `fromLexJson` runs `CID.parse` on every image `ref.$link`, so
a hand-mangled `$link` throws and silently drops the record. Fixtures must use real, parseable
CIDs for image refs (the record-level `cid` string can be arbitrary). (2) git worktrees do not
share `node_modules` — the worktree needed its own `npm ci` before any build/test ran. (3) The
two Browse status strings (search "N recipes cached" vs starter "N starter pack recipes" +
failed/offline suffixes) had to be reconstructed inside the seam via a `kind` discriminator; the
Pass 3 gap-catch here prevented the race test (exact `toHaveText`) from breaking. (4) The live
account had exactly the one predicted malformed record and no bad diet tokens, matching the
Phase 0 assessment.
