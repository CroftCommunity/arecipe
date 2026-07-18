# Shopping lists from scheduled meal plans (per-recipe + combined)

**Status:** ✅ **Implemented 2026-07-18.** TDD-first (red → green per phase).
Gate green: lint · typecheck (both tsconfigs) · 703 unit (101 new in
`shopping-list.spec.ts`) · build (browse untouched at 10K; meals 37K) · 194
hermetic e2e (3 new in `shopping-list.spec.ts`). See §Run summary for per-phase
red→green evidence.

## Mission

From the Meals page (planner **and** the public published-plan calendar view),
generate a shopping list for a chosen range of scheduled meals, in two views:

- **By recipe** — one section per scheduled recipe (×N when it repeats in the
  range), one ingredient per line, verbatim. Lines the aggregator could NOT roll
  up carry a flag here (the non-aggregate view is where "didn't roll up / couldn't
  be determined" shows), so the mental delta at the store is only the flagged
  stragglers.
- **Combined** — ingredients grouped across recipes: same ingredient in three
  recipes becomes one line with a summed quantity where units are compatible, plus
  an honest "as listed" section for everything the parser declines.

Both views copyable and downloadable as one markdown file. Aggregation is a small
DETERMINISTIC parser — no ML, no dependency, conservative by design.

## Phase 0 — grounding (verified 2026-07-18 against `main`)

Locations reused / findings:

- **Week expansion / repeat stamping:** `expandCalendar(weeks)` →
  `CalendarWeek[]` in `src/recipes/meal-plan.ts:139`. Each source week stamped
  `repeat` (clamped 1–12) times; `buildCalendarRows` (meals.ts:117) lays them out
  7 days/row cumulatively.
- **Dated vs undated:** a plan's `startDate?` is optional. `dateForSlot`,
  `weekRangeLabel`, `nextMonday` in `src/recipes/meal-plan-dates.ts`. Dated plans
  get real calendar dates from a first-Monday anchor; undated plans render by week
  index. Range selector must handle both.
- **Single-recipe fetch to reuse:** the cache-first `loadRecipe(uri)` pattern in
  `src/pages/recipe.ts:68` — `createRecipeCache().get(uri)` (IndexedDB) then
  `resolveDidDoc(did)` + `createRecordReader()({pds,did,rkey})`
  (`src/recipes/read.ts:45`). `RecipeValue.ingredients: string[]`. Meals carry
  `{uri, cid, name}` inline; **ingredients are NOT denormalized** — the list
  builder resolves each unique uri.
- **Export/download idiom:** blob → `URL.createObjectURL` → rendered `<a download>`
  (no `.click()` helper), inlined in `src/pages/browse.ts:413` (`buildExportPanel`,
  `revokeDownload`). The pure `serializeRecipes` in `src/recipes/export.ts` is the
  "pure core renders text, page does the blob" precedent. Copy idiom: a button that
  reads a payload and `navigator.clipboard.writeText`, flashing ✓ 1200ms
  (`quickCopyControl`, `src/recipes/view.ts:34`; `renderShareLink`, meals.ts:819).
- **meals.ts seams for the action:**
  - Planner header actions row `headerActions` (`.meals-actions`, meals.ts:650)
    and the publish/share section (`shareSection`, meals.ts:792) — natural homes.
  - **FINDING (drift from §2):** the public cold view is **not** `?did=` — it is
    **`?mealplan=<rkey>&user=<did|handle>`**, routed to `showSharedPlan(app, rkey,
    userParam)` (meals.ts:186). That mode renders a **minimal header only**
    (`.shared-plan-head` title + calendar, no toolbar). The Shopping-list action is
    added there for the public view. `showSharedPlan` already holds the full
    `LocalPlan` (via `getPdsPlan`), so every meal uri is in hand.
  - **FINDING:** there is currently **no toolbar in the shared view**, so the
    action is a standalone control appended into `.shared-plan-head` rather than a
    toolbar button.

No new NSID and no change to any consumed record shape → **no `docs/LEXICONS.md`
change** (ingredients on `exchange.recipe.recipe` are already a consumed field).
This keeps conflict risk with RUN-RECIPE-IMPORT low.

## Locked design decisions

- **D1 Entry + range.** A "Shopping list" action per plan, in BOTH the signed-in
  planner and the public `?mealplan=&user=` view (module is auth-free). Range:
  dated plans → from/to date pickers defaulting to the plan's full expanded range;
  undated plans → week-based selector (week 1..N, honoring `repeat`) defaulting to
  the whole plan. "All scheduled" is the default in both modes.
- **D2 Resolution.** Collect the unique recipe strongRefs in range; resolve each
  via the cache-first single-recipe path (injectable for tests). A recipe that
  fails to resolve appears in BOTH views by its denormalized name with an
  "ingredients unavailable" flag — never dropped, never blanking the rest.
- **D3 Parser (pure, conservative).** For each ingredient line produce
  `{ qty?, unit?, name, raw, unparsed? }`:
  - quantities — integers, decimals, ASCII fractions (`1/2`), unicode vulgar
    fractions (½ ¼ ¾ ⅓ ⅔ ⅛ …), mixed forms (`1 ½`, `1 1/2`), ranges (`1-2`) kept
    AS ranges.
  - units — a small canonical table with synonyms + plural forms only
    (tsp/teaspoon, tbsp/tablespoon, cup, oz/ounce, lb/pound, g/gram, kg, ml,
    l/liter/litre, pinch); an unrecognized middle token is part of the NAME.
  - names — lowercase, trim, collapse whitespace, simple plural fold (trailing
    s/es with a small exception list). NO descriptor stripping in v1
    ("ground cinnamon" and "cinnamon" do NOT merge — they flag).
  - a line yielding no usable name (empty after stripping qty/unit) is UNPARSED and
    carries its raw text.
- **D4 Aggregation.** Key = normalized name. Units map to a **family**; families
  sum via ratios to a base unit and NEVER convert across families:
  - Sub-families keep exact integer ratios and avoid cross-system guesswork:
    `vol-imperial` (tsp=1, tbsp=3, cup=48; base tsp), `vol-metric` (ml=1, l=1000),
    `wt-imperial` (oz=1, lb=16), `wt-metric` (g=1, kg=1000), `count` (unit-less),
    `pinch`. Two "volume" lines in different systems are an honest separate listing
    under the heading, not a fuzzy imperial↔metric conversion (conservative > wrong).
  - Within a family: sum via ratios; render the total in the **smallest unit
    present** (keeps whole numbers whole), fraction-formatted for the remainder.
  - Ranges sum end-to-end and stay ranges. A recipe scheduled ×N multiplies its
    quantities by N. Cross-family under one heading renders `+`-joined
    ("flour — 2 cups + 100 g"). Bare unquantified lines aggregate as an occurrence
    count rendered "×N", never an invented quantity (count family, bare = 1).
  - UNPARSED lines → Combined "as listed" section attributed to their recipes; the
    originals are flagged in By-recipe. A By-recipe line is flagged when it did not
    roll up into a family aggregate (UNPARSED, or unavailable recipe).
- **D5 Output.** Inline panel (export-panel idiom) with two tabs — "By recipe" and
  "Combined" — plus Copy (active tab) and Download. The downloaded file is one
  markdown document, Combined first, then By recipe, headed by plan name + range.
  Filename `shopping-<plan-slug>-<range>.md`. No persistence, no PDS writes, no
  checkbox state.
- **D6 Code placement.** Pure core `src/recipes/shopping-list.ts`: parse, normalize,
  aggregate, render-to-markdown, range/ref selection — every behavior unit-tested
  with zero DOM. Page wiring (panel, resolver, blob download) in meals.ts only.
- **D7 Deferred (not in v1):** descriptor folding ("ground/chopped/fresh X" → X
  with provenance); pantry exclusions; aisle grouping; servings scaling;
  persistent/checkable list state; publishing a list as a record.

## Phases

- **Phase 1 — parser core (fixtures first).** `tests/fixtures/shopping/
  ingredient-lines.json` table + RED `tests/unit/recipes/shopping-list.spec.ts` →
  GREEN parser. The table is the grammar contract.
- **Phase 2 — aggregation + flags.** Sums, ×N, ranges, cross-family separation,
  bare ×N, unparsed → as-listed, per-recipe flag mapping; identity-modulo-normal
  sanity.
- **Phase 3 — range + resolution.** Dated-range filtering over expanded weeks
  (repeat honored); undated week-index selection; unique-ref collection; injected
  fetcher incl. the unavailable path.
- **Phase 4 — panel + export.** Panel renders both tabs from injected results; Copy
  copies active tab; Download produces the D5 document; markdown renderer unit-level;
  testids.
- **Phase 5 — e2e + closeout.** Hermetic routed fixtures (dated plan + recipes,
  roll-up, flagged line, ×2 repeat; undated week selection; unresolvable ref; public
  view). Mobile-fit. Plan Status + run summary.

## Run summary

Red→green, per phase (all in `tests/unit/recipes/shopping-list.spec.ts` unless
noted):

- **Phase 1 — parser.** Fixture table `tests/fixtures/shopping/
  ingredient-lines.json` (**67 rows** covering every D3 form). RED: 53 failing
  against a stub → GREEN: 68 (67 rows + coverage guard).
- **Phase 2 — aggregation + flags.** RED: 18 failing (`buildShoppingList`
  undefined) → GREEN. One follow-up fix: fractions ≤ 1 render singular units
  ("¾ cup", not "cups").
- **Phase 3 — range + resolution.** RED: 9 failing → GREEN (after wiring the
  `expandCalendar`/`dateForSlot` imports). Covers repeat-honored counts, dated
  date-filtering, undated week-index selection, injected fetcher incl. the
  null/throw unavailable paths.
- **Phase 4 — markdown + panel.** RED: 5 renderer tests → GREEN (101 total in
  the core spec). Panel + resolver wired into `meals.ts` (`buildShoppingListSection`,
  `defaultIngredientFetcher`, `renderCombinedDom`/`renderByRecipeDom`), reused by
  the planner (`calendar`) and the public `showSharedPlan` head. Styles mirror
  the export-panel idiom.
- **Phase 5 — e2e.** `tests/e2e/shopping-list.spec.ts` (3 tests, all GREEN):
  public plan view builds both views with a roll-up (`flour — 6 cups` from two
  recipes across a ×2 repeat week), a flagged straggler (`2 cups ⚑`), an
  unavailable recipe (`Ghost Stew`), the as-listed section, and a `.md` download;
  a 360px mobile-fit guard; an undated planner exercising the week selector.
  Full hermetic e2e suite: 194 passed (no regressions).

## Outcome

- `src/recipes/shopping-list.ts` — the pure core: `parseIngredient`
  (fixture-driven grammar), `buildShoppingList` (family-keyed aggregation with the
  vol/wt/count/pinch families, imperial↔metric kept separate, ×N, ranges,
  cross-family separation, bare ×N, unparsed→as-listed, per-recipe flags),
  `collectScheduledRefs`/`resolveShoppingList` (range selection + injected
  resolution), and the markdown renderers + `shoppingListFilename`.
- `src/pages/meals.ts` — `buildShoppingListSection` (the action + two-tab panel,
  Copy active tab, Download the D5 document), a cache-first `defaultIngredientFetcher`,
  and the DOM renderers; mounted in the planner and the public view.
- `styles.css` — `.shopping*` rules (export-panel idiom; flags wear `--rust`).
- No `docs/LEXICONS.md` change: ingredients on `exchange.recipe.recipe` are an
  already-consumed field; no new NSID and no consumed-shape change.
- **FINDING recorded (Phase 0):** the public plan view is
  `?mealplan=<rkey>&user=<did|handle>`, not the `?did=` §2 assumed; the action is
  added to `showSharedPlan`'s `.shared-plan-head` (which had no toolbar).
- Visual check: 400px screenshots of both tabs — date-range defaults, flagged
  line, unavailable note, as-listed section, and roll-up all render soundly and
  fit the phone width.

## Follow-up (2026-07-18, same PR) — detail toggle + placement

Owner feedback after the first cut:

- **Detail toggle** in the panel actions row (`shopping-detail-toggle`): one
  control, two meanings by active tab. By-recipe → each line's amount is scaled
  by the recipe's ×N (`scaleIngredientLine` — pluralizes the unit with the
  scaled amount, marks a bare line with an occurrence count, leaves an
  unparseable line verbatim); Combined → each aggregated line carries the
  recipes it came from (`CombinedLine.recipes`, surfaced via
  `combinedLineText(line, {sources})`). The toggle's label tracks the active tab
  ("Amounts ×N" / "Show sources"); Copy + Download honor it
  (`renderShoppingListDocument({…, detail})`). This resolves the earlier ×N
  ambiguity by making it a user choice rather than a fixed reading.
- **Action button** is now icon-only (🛒, `aria-label`/`title` "Shopping list").
- **Placement:** in the planner it rides the publish row — Shopping list
  left-aligned, Publish (+ reset toggle) right-aligned (`space-between`), the
  panel dropping below; in the public view it sits opposite the plan title.
- Tests: +8 unit (`scaleIngredientLine`, source attribution, multiply/sources
  rendering) → 713 unit total; the public-view e2e now exercises the toggle in
  both tabs (attribution + ×N scaling). Gate green.
