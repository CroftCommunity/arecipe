# Recipe model extensions — alternative versions, multiple fun facts, dual methods

**Status:** Pass 1 · Phase 0 discovery · Pass 2 gap analysis · **Pass 3 quality gates ALL
COMPLETE 2026-07-09. Plan is READY FOR EXECUTION — no unresolved BLOCKING items.** 10 phases
(0 + 1 + 1b + 2 + 3 + 4a done). **UI design REVISED 2026-07-09 via mockups** (`docs/mockups/`):
inline flip primary, grid = View All, + Focus mode + Settings fun-facts toggle; comments stay
per-version (dish-level deferred). Phases 0–4b done. **Next: Phase 4c (inline version flip on the
recipe page — PRIMARY UX).** Worktree `recipe-import-batch`.

## Problem Statement

The recipe corpus now holds **136 structured recipes** across 6 files plus **41 live
records** on arecipe.bsky.social. Three modeling needs have emerged that the current
`exchange.recipe.recipe` lexicon and the recipe page do not support:

1. **Alternative versions of the same dish (cross-source).** We deliberately keep
   *multiple* recipes for one dish rather than picking a "winner" — e.g. chocolate
   chip cookies exist across batches, banana bread in several, boeuf bourguignon in 2.
   The user wants a recipe-page **version switcher** (inline "flip", and/or a deeper
   compare-and-pick page). **[Pass 2 correction]** The alt-version groups are *not* yet
   encoded as usable data — see the Pass 2 gap: `dish`/`altOf` are inconsistent across
   files and grouping by them yields only 1 accidental group. A canonical `dishKey`
   normalization across all 177 records (new Phase 1b) is a prerequisite.
2. **Multiple fun facts per dish.** Each source contributes its own fun fact, so a
   merged dish accrues several. The user wants `funFact` → **`funFacts[]`**, cycled/
   picked with the same pattern as versions. The lexicon has **no fun-fact field at
   all** today.
3. **Dual preparation methods within one recipe.** The dessert batch models a *rapid*
   (microwave/air-fryer/no-bake) and a *traditional* (oven/stovetop) method per recipe
   (`methods[]`). The lexicon has only a single `instructions[]`.

Constraints: static PWA, **no backend**; records are individual `exchange.recipe.recipe`
records addressed by AT-URI and CID-verified; the lexicon namespace `exchange.recipe.*`
is **owned by recipe.exchange**, not arecipe (per ECOSYSTEM). Whatever we add must not
break the existing 41 published records or the `starter`/`recipes` e2e suites, and must
carry a migration path for the 41 records + `pds-funfacts.json` prep.

## Reasoning

**Lexicon strategy — open-world additive fields first, overlay fallback (DECIDED).**
The `exchange.recipe.recipe` record def lists `required: [name, text, ingredients,
instructions, createdAt, updatedAt]` and a fixed property set (no `additionalProperties:
false` observed). AT Protocol records commonly tolerate extra fields (open-world), and
arecipe already treats the schema open-world (browse filters read fields defensively).
Since arecipe does **not own** the lexicon, the decided path is a **three-tier ladder**:
1. **Open-world extra fields** (`funFacts`, `dishKey`, `versionLabel`, sibling refs) on the
   `exchange.recipe.recipe` record — recipe.exchange ignores them, arecipe consumes them.
   Preferred **if** the PDS accepts unknown fields on a putRecord for this `$type` (Phase 0
   D1 probe).
2. **`app.arecipe.*` overlay record** — if D1 shows the PDS strips/rejects unknown fields,
   move the extras into an arecipe-owned record that references each recipe by AT-URI. Clean
   ownership, no validation risk; cost is a second fetch per recipe page.
3. **Formal lexicon amendment with recipe.exchange** — correct long-term, deferred as a
   **future TODO**; never blocks this work.

**Versions — self-contained records grouped by `dishKey` (DECIDED).** A dish is a *group*
of version records; there is **no separate `dish` collection record**. Each version record
is self-describing via open-world fields:
- `dishKey` — a stable slug ("chocolate-chip-cookies") that groups the versions.
- `versionLabel` — how this version is distinguished ("Sally's", "King Arthur", **or a
  method label** like "Microwave" / "Oven" — see Methods below).
- `funFacts[]` — the pooled facts for the dish, **denormalized onto each version** so any
  single record renders the full set (see Fun facts).
- optional `primaryVersion: boolean` — the default pick.
The separate-`dish`-record option was rejected: it adds a record type + an extra fetch and
is effectively the tier-2 overlay even when the open-world probe passes.

**Sibling-version discovery in a backendless client.** Because the corpus lives in a
**single repo** (arecipe.bsky.social), the browse feed already lists every recipe; grouping
by `dishKey` over that feed (or a `listRecords` filter on a cold shareable link) is cheap
and always correct — no cross-record write coordination. Optionally, sibling AT-URIs may be
denormalized onto each record as a fetch-avoidance optimization, but that requires a
two-pass publish (create → backfill URIs) or deterministic rkeys; treat it as a deferred
optimization, not a Phase-1 requirement. Discovery mechanism confirmed in Phase 0 D2.

**Fun facts — `funFacts[]` denormalized per record (DECIDED).** Each record carries the
dish's full pooled `funFacts[]` (array of `{ text, source? }`). Denormalizing (rather than a
single dish record holding them) keeps every version self-describing and makes the 41-record
migration a per-record field add. Cost: facts are duplicated across a dish's siblings and
must be re-synced if a fact is added — acceptable given publishing is a controlled batch.
Single `funFact` string rejected — the whole point is plurality.

**Methods = versions (DECIDED — unified).** The dual rapid/traditional methods are **not** a
separate `methods[]` field. A dual-method recipe becomes **two version records** sharing a
`dishKey`, each distinguished by a method `versionLabel` ("Microwave" vs "Oven"), each with
its own `instructions[]`. This collapses two axes (cross-source versions, within-recipe
methods) into **one grouping + switcher mechanism**. `instructions[]` stays lexicon-canonical
per record. The dessert JSON's `methods[]` shape is **split into sibling records at publish
time** (Phase 7). No method toggle UI — the version switcher handles it.

**UI shape — inline flip primary; grid = "View All" (REVISED 2026-07-09 via mockup).** The
recipe page stays the simple landing (one real recipe). The **primary** version mechanism is an
**inline flip**: a `‹ N of M ›` control bar above the banner (shown only when M > 1) that swaps
the image, title, ingredients, and instructions **in place**; `▦ View All` (right side) opens the
secondary `dish.html?key=<dishKey>` **grid** for deliberate side-by-side compare; a `⛶ Focus`
button opens a full-screen cook view of the current version. Landing/flip order = a **stable
default** (`primaryVersion` then published order); most-liked-first is a Deferred TODO. **Fun facts**
are pooled per dish, shown
just above Comments, and gated by a **Settings "Include fun facts" toggle** (on by default).
**Comments stay per-version** (no change to the `app.arecipe.comment` model); **dish-level shared
comments are a Deferred TODO** (see below). Reference mockups live in `docs/mockups/`. This inverts
the earlier "compare-page-first" decision — the grid is now the deeper option, not the entry point.

**Migration + publish — pilot first (DECIDED).** Once fields exist: (1) a
fix-metadata-style op adds `funFacts` (from `pds-funfacts.json`) + `dishKey` to the 41 live
records (preserve `createdAt`, bump `updatedAt`, idempotent, dry-run first); (2) a **pilot
batch** (one version group with fun facts + a handful of singles) is published and verified
end-to-end (probe → fields → images → render) on real records **before** the bulk publish of
the remaining imported recipes.

**Alternatives considered:** a separate `dish` collection record — richer but backend-heavy
and redundant with the overlay; rejected. A dedicated `methods[]` field — rejected in favor
of methods-as-versions. Coordinating a formal lexicon amendment up front — deferred as a
future TODO behind the open-world probe. Client-only name grouping — fragile; rejected.

## Verified Assumptions

- `exchange.recipe.recipe` record def: `required = [name, text, ingredients, instructions,
  createdAt, updatedAt]`; properties are a fixed set with **no** `funFact(s)`, `methods`,
  `dishKey`, or `variantOf` (read `tests/fixtures/lexicons/exchange.recipe.recipe.json`).
- The record def does **not** declare `additionalProperties: false` in the fixture. **VERIFIED
  (Phase 0 D1, 2026-07-09):** the live bsky.social PDS accepts unknown fields (`dishKey`,
  `versionLabel`, `primaryVersion`, `funFacts[]`) on an `exchange.recipe.recipe` createRecord;
  they survive getRecord byte-identical with matching CID. Open-world path confirmed.
- **VERIFIED (Phase 0 D2):** `src/recipes/read.ts` already preserves unknown fields (open-world
  `RecipeValue`); but `createRecipeReader` does a single non-paginated `listRecords` (no
  `limit`/`cursor`) — only the first ~50 records. Pagination needed for correct sibling
  discovery once the repo exceeds one page (Phase 4 prereq).
- `src/pages/recipe.ts` loads a single record by `recipe.html?u=<at-uri>`, cache-first,
  resolves DID→PDS→getRecord, `cache.put`, renders `renderRecipeDetail(entry,{author})`
  (read `recipe.ts`); it has **no** sibling-version discovery today.
- `src/recipes/view.ts` `renderRecipeDetail` builds the detail DOM; `chipsEl`/`recipeFacets`
  and the trust surface exist (read in full earlier).
- **[Pass 2 — CORRECTED]** Import JSON carries a `funFact` (SINGULAR string, not `funFacts[]`),
  dessert carries `methods[]`, and `dish`/`altOf` fields exist but are **inconsistent and not
  group-usable**: `own-batch` has neither field; `artisan-baking` `altOf` is free text
  ("brownie", "cinnamon roll"); `julia-child` `dish` is a mangled slug ("cr-me-br-l-e") with a
  scrambled `altOf` ("brulee creme"); the same dish gets a different `dish` slug per file.
  Grouping by `dish`/`altOf` across the 6 files yields **1** group (boeuf-bourguignon), not 12.
  → canonical `dishKey` must be derived/normalized (Phase 1b), and `funFact`→`funFacts[]`
  conversion + per-dishKey pooling happens at publish (Phase 6).
- **[Pass 2 — VERIFIED]** `pds-funfacts.json` = `{ _meta, funFacts: [{ rkey, name, funFact }×41] }`
  (one singular fact per live record). Many live records (Banana Bread, Beef Bourguignon, Mac
  and Cheese, Apple Pie, Caesar Salad, Enchiladas, Meatloaf…) share a dish with imported
  recipes → version groups + fun-fact pools span **live + imported** (all 177 records).
- **[Pass 2 — VERIFIED]** Pages are wired in `scripts/build.mjs`: `PAGES` array + `HTML` map
  (`index.html`→`browse`; there is no `browse.html`), and SW precache derives from `HTML`.
  A new `dish.html` page requires editing BOTH plus creating the top-level `dish.html` file.
- **[Pass 2 — VERIFIED]** `renderRecipeDetail(entry: CachedRecipe, options: RenderOptions = {})`
  (view.ts:280) is the single detail-render path; recipe.ts calls it at :390 (cache) and :405
  (fresh). It reads `entry.value`, so `funFacts`/`dishKey` can be read from the record with no
  signature change; a "sibling exists?" flag for the versions link needs a new `RenderOptions`
  field (recipe.ts must discover siblings and pass it). No existing funFact/version UI in src.
- Lexicon namespace `exchange.recipe.*` is owned by recipe.exchange (ECOSYSTEM); arecipe
  is a consumer. **Whether arecipe may amend it, or only add open-world fields, is an
  open question** (cite the FACTCHECK/ECOSYSTEM as source of truth before deciding).

## Documentation Impact

- `docs/DESIGN.md` — add a section on the version model (dishKey grouping, methods-as-
  versions) and the `dish.html` compare-and-pick page + fun-fact cycler. **Scheduled in Phase 4b**
  (where `dish.html` becomes real), not deferred.
- **`README.md:31-36` — page inventory.** These lines enumerate every top-level page
  (`index.html`/Browse, `cookbook.html`, `mine.html`, `settings.html`, `recipe.html`,
  `editor.html`). Phase 4b adds `dish.html` and **updates this list in the same phase**
  (verified location; supersedes the earlier "no README change" note).
- `tests/fixtures/lexicons/exchange.recipe.recipe.json` — only if D1 forces a formal lexicon
  extension (unlikely given the open-world/overlay decision); otherwise untouched.
- If D1 selects the overlay, a new `app.arecipe.*` lexicon fixture/doc (Phase 1).
- **`docs/LEXICONS.md` — NSID/lexicon registry (created 2026-07-09).** Records every NSID
  arecipe creates/consumes/extends and the open-world extension fields on
  `exchange.recipe.recipe` (`dishKey`, `versionLabel`, `primaryVersion`, `funFacts[]`). Phase 1
  keeps the extension-field table in sync with the locked types; Phase 6 flips those fields'
  status note to "live on the PDS" once published. Any new NSID (e.g. a revived overlay) is
  registered here first.
- `docs/mockups/recipe-flip-mockup.html` + `docs/mockups/dish-mockup.html` — the agreed UI
  reference (inline flip + Focus; grid). Committed 2026-07-09; update if the UX changes.
- `spike/import/*.json` `_meta` — note the fields became live (in the publish phase).

## Concurrency Map

Sequential spine: Phase 0 → 1 → 1b → 2 → 3 → 4a → 4b → 4c → 4d → 4e → 5 → 6.
**All phases sequential.** Rationale from the per-phase write-sets: Phases 1/1b write `model.ts`
which 2/3/4a read; Phases 2/3/4c/4d/5 all write `src/recipes/view.ts` (shared write-set → cannot
parallelize); 4b builds `dish.html` (the View All target that 4c links to) and edits
`scripts/build.mjs`; 4c/4d write `recipe.ts` + `view.ts` (the flip bar then the Focus button on
that same bar); 4e (browse) writes `browse.ts` (disjoint from view.ts — a candidate to
parallelize, but depends on 4a and links to 4b's dish.html, so kept sequential); 5 gates the
`renderFunFacts` call sites (view.ts + dish.ts) so it follows 4b; 6 depends on `dishkeys.json`
(1b) and the UI phases (to render the pilot) and is the only phase that mutates live PDS state. **Candidate parallelism considered and rejected:** 1b (spike tooling) is
write-disjoint from 1/2 (src) and *could* run alongside them — but it gates 4b/6 and needs its
own user-review checkpoint, so it stays on the spine. No worktree/parallel dispatch planned;
if adopted later, the only live-mutating phase (6) must never run concurrently with anything.

## Phases

**Execution notes (Pass 3):** Every phase is **test-first (RED → GREEN)** — the named
wiring/unit test is written and observed failing before the implementation. Phases 1 and 2 are
foundational component phases (shared types; a pure renderer) with no entry point of their own;
their entry-point wiring test lands in Phase 3 (funFacts render on the recipe page) and Phase 4
(grouping used by dish.html/browse) — this deferral is intentional, not a missing wiring test.
Test locations follow existing convention: unit → `tests/unit/recipes/*.spec.ts`, e2e →
`tests/e2e/*.spec.ts` (Playwright with route-mocked `getRecord`/`listRecords`).

### Phase 0: Discovery (BLOCKING gate for the schema strategy) — COMPLETE 2026-07-09
**Goal:** Settle the three unknowns that shape every later phase.
- [x] **D1: Does the PDS accept extra/unknown fields on `exchange.recipe.recipe`?** **YES.**
  A throwaway record was `createRecord`ed to arecipe.bsky.social carrying `dishKey`,
  `versionLabel`, `primaryVersion`, and `funFacts` (array of `{text, source?}`). All four
  survived a `getRecord` round-trip **byte-identical**; `cid` matched create → readback; the
  probe record was deleted. **Tier 1 (open-world fields) is confirmed viable — no overlay
  needed.** (Probe: scratchpad `d1-probe.mjs`, disposition `throwaway`, done.)
- [x] **D2: How do the pages discover sibling versions?** **Client-side `dishKey` grouping
  over `listRecords`.** `src/recipes/read.ts` is already open-world: `RecipeValue` has
  `[key: string]: unknown`, `validateRecipeValue` only enforces the required fields, and
  unknown extras are preserved — so `dishKey`/`funFacts`/`versionLabel` flow through
  `createRecipeReader`/`createRecordReader` with **zero parser changes**. Cold links use
  `createRecordReader` (getRecord → one record carrying `dishKey`); `dish.html` then calls
  `createRecipeReader` and filters by `dishKey`. **GAP FOUND:** `createRecipeReader`
  (read.ts:64) issues a **single** `listRecords` with **no `limit`/`cursor`** → only the PDS
  default first page (~50). With ~177 records post-import, siblings on later pages are missed
  (and `browse.ts` likely already truncates at 50). Pagination is now Phase 4 scope.
- [x] **D3: Lexicon ownership/strictness.** Confirmed: open-world is already the codebase's
  established model (read.ts header comment; browse filters read defensively) and D1 proves
  the PDS tolerates extras. arecipe stays a **consumer** of `exchange.recipe.*`; no amendment.
**Done when:** ✅ D1–D3 resolved with firsthand evidence; strategy = **open-world fields**,
discovery = **`dishKey` grouping over paginated `listRecords`**. Later phases updated to match.

### Phase 1: Schema + shared types — COMPLETE 2026-07-09
**Outcome:** `src/recipes/model.ts` locks the types (`FunFact`, `DishKey`, `RecipeExt`) + defensive
open-world accessors (`funFactsOf`, `dishKeyOf`, `versionLabelOf`, `isPrimaryVersion`,
`extensionsOf`) that read the extension fields from a record value whose extras are `unknown`.
`funFactsOf` also falls back to a legacy singular `funFact` string (import corpus + pre-migration
live records). 11 unit tests (`tests/unit/recipes/model.spec.ts`), typecheck + lint clean, full
204-test suite green. No `methods[]` (methods are versions). LEXICONS.md field table points here.
**Goal:** Lock the field shapes (`dishKey`, `versionLabel`, `funFacts[]` of `{text, source?}`,
optional `primaryVersion`) as shared TS types + JSON-schema notes; align the import JSON
`_meta`. **No `methods[]`** — methods are versions. If D1 chose the overlay, also define the
`app.arecipe.*` overlay record shape. **Changes:** shared types module (e.g.
`src/recipes/model.ts`); overlay-record type/fixture if applicable. **Wiring test:** a
type-level + unit test that a record with the new fields parses and the old records (no new
fields) still parse. **Validation:** Narrow.
**Read-set:** `src/recipes/read.ts` (RecipeValue). **Write-set:** `src/recipes/model.ts` (new)
+ its unit test. **Shared-state:** none. **Done when:** `import { DishKey, FunFact, RecipeExt }`
compiles and `npx vitest run tests/unit/recipes/model.spec.ts` passes; old records still parse.

### Phase 1b: Canonical dishKey normalization (NEW — Pass 2; prereq for Phases 4 & 6) — COMPLETE 2026-07-09
**Outcome:** `spike/import/dishkeys.mjs` (pure: `foldAccents`, `normalizeDishKey`, `ALIASES`,
`proposeGroups`; 7 node --test cases) + `build-dishkeys.mjs` (loads all 177 records — 136
imported + 41 live paginated — writes `spike/import/dishkeys.json` + a review report).
Name-based normalization (accent-fold + qualifier-prefix strip + trailing "with …" strip +
`boeuf→beef-bourguignon` alias) yields **15 reviewed version groups** across 177 records
(vs 1 from the raw `dish`/`altOf` fields): banana-bread ×4, chocolate-chip-cookies ×3,
beef-bourguignon ×3, and twelve ×2 (incl. caesar-salad after the user merged the grilled-chicken
variant). `banana-bread-mug-cake` kept distinct. User reviewed & confirmed the groups.
`dishkeys.json` is the kept artifact feeding Phase 6.
**Goal:** Produce a **reviewed** canonical-`dishKey` mapping covering **all 177 records** (136
imported across 6 files + 41 live), reconciling name/slug variants so true alternates share one
key and unrelated dishes don't collide. Because the existing `dish`/`altOf` fields are
inconsistent (Verified Assumptions), this is a curation step, not a field-copy: a script
proposes keys (slugify(name) + a synonym/alias table), emits a `spike/import/dishkeys.json`
mapping (`{ recordRef → dishKey, version groups }`) plus a human-review report of proposed
groups, and the user confirms/edits the groupings (esp. cross-set live↔imported: e.g. does live
"Beef Bourguignon" group with imported boeuf-bourguignon? "Banana Bread" ×4?). Also flags the
mislabeled `banana-bread-mug-cake` (a mug cake, not banana bread) and the mangled julia slugs.
**Read-set:** `spike/import/*.json`, live `listRecords`, `pds-funfacts.json`. **Write-set:**
`spike/import/build-dishkeys.mjs` (+ test) + `spike/import/dishkeys.json` (data). **Shared-state:**
read-only against live PDS (no writes). **Wiring test:** unit — grouping is deterministic and
the review report lists every multi-version group; no dish appears under two keys.
**Edges (mutation-resistant tests):** single-version dish → group of exactly 1 (no false
merge); two records with similar names but distinct dishes → do NOT collide; a variant name
maps to its canonical key via the alias table; an already-clean `dish` slug is preserved;
`banana-bread-mug-cake` is NOT pooled into `banana-bread`. **Logging:** the report prints every
proposed multi-version group + any record that matched no alias (needs human eyes).
**Done when:** `dishkeys.json` exists, the user has reviewed the proposed groups, and every
imported + live record maps to exactly one `dishKey` (`vitest run tests/unit/recipes` green).
**Validation:** Moderate (human review of groupings is the real gate). **Disposition:**
`dishkeys.json` is kept (feeds Phase 6).

### Phase 2: Fun-fact renderer (view) — COMPLETE 2026-07-09
**Outcome:** `renderFunFacts(facts: FunFact[]): HTMLElement | null` in `src/recipes/view.ts` —
a "Did you know?" section; null when empty; a single fact shows no nav; multiple facts get a
`fun-fact-next` button + `fun-fact-count` "i / n" that cycles (wrapping) in place; source shown
when present. 4 happy-dom unit tests in `tests/unit/recipes/view.spec.ts` (28 total there),
typecheck + lint clean, full 208-test suite green. Render-only — wired in Phase 3.
**Goal:** `renderFunFacts(facts): HTMLElement` — a "Did you know?" element that cycles
`funFacts[]` (next/prev or shuffle), omitted when empty. Render-only. **Wiring test:** none
(gated by Phase 3). **Validation:** Narrow (happy-dom unit tests).
**Read-set:** `model.ts`. **Write-set:** `src/recipes/view.ts` (add `renderFunFacts`) + a unit
test. **Shared-state:** none. **Done when:** `renderFunFacts([...])` returns a cycling element;
empty → returns null/omitted; `vitest run tests/unit/recipes` passes.

### Phase 3: Fun-facts on the recipe page (wired) — COMPLETE 2026-07-09
**Outcome:** `renderRecipeDetail` now calls `renderFunFacts(funFactsOf(value))` and appends the
cycler after the ingredients/instructions columns (before the provenance line); null → nothing
rendered. recipe.ts needs no change — it already passes the record's `value` (which will carry
`funFacts`) into `renderRecipeDetail` at :390/:405, so the read wires the feature through the
live render path. 2 unit tests on `renderRecipeDetail` (with-facts shows the cycler + next;
no-facts omits the section) — the same render-path testing used for attribution/credit. Full
210-test suite green, typecheck + lint clean.
**Goal:** `renderRecipeDetail` reads `value.funFacts` and appends the Phase-2 cycler; recipe.ts
needs no change (facts are denormalized on the record). Cycler shows on real records.
**Read-set:** `model.ts`, `view.ts`. **Write-set:** `src/recipes/view.ts` (wire the cycler into
`renderRecipeDetail`) + e2e spec. **Shared-state:** none. **Wiring test:** e2e (`tests/e2e/`) —
load a recipe fixture with multiple facts; the cycler shows and advances. **Validation:** Moderate.

### Phase 4a: Paginated reads + version-grouping helper (prereq for 4b/4c) — COMPLETE 2026-07-09
**Outcome:** `createRecipeReader` now follows the `listRecords` cursor to the end (limit=100),
concatenating all pages, with an empty-page stop + a 200-page runaway backstop (logs on cap).
`model.ts` gains `groupByDishKey(records)` (Map keyed by dishKey, records without a key excluded)
and `siblingsOf(dishKey, records)`. Tests: 2 pagination cases (multi-page concat; empty-page
terminates) + 2 grouping cases, all mutation-resistant. **Regression caught + fixed:** the
recorded `listRecords` fixture carried a cursor, which looped the paginator against static mocks
(unit OOM + would hang browser e2e) — stripped the cursor from the fixture (it represents a
complete small repo) and routed the parsing tests through a `terminalList` helper. Full 214 unit
tests green; built + ran the affected e2e (browse/recipes/comments = 18) green, no loop.
NOTE: this fix means `browse.ts` now loads the WHOLE repo (the pre-existing ~50 truncation is
gone as a side effect; Phase 4d adds the version-collapse UI on top).
**Goal:** (1) extend `createRecipeReader` (read.ts:64) with **cursor pagination** (loop
`limit=100` + `cursor`, like `publish-batch.mjs`) so all of a dish's siblings are fetched — a
single ~50-record page would silently miss versions. (2) a pure `groupByDishKey(records)` /
`siblingsOf(dishKey, records)` helper in `model.ts`. **Read-set:** `read.ts`. **Write-set:**
`src/recipes/read.ts` + `src/recipes/model.ts` + their unit tests. **Shared-state:** none.
**Wiring test:** unit — paginator concatenates multi-page `listRecords` (mock 2 pages); grouping
buckets by `dishKey`. **Edges:** 0 records → `[]`; exactly 1 page (response has no `cursor`) →
single fetch, no loop; 2 pages (cursor then absent) → concatenated, loop terminates; grouping a
`dishKey` with 1 member vs 2+ members. **Logging:** `log.debug('recipes', 'paged', {pages, total})`
so a short read is diagnosable. **Verification:** `vitest run tests/unit/recipes/read.spec.ts`.
**Validation:** Moderate. NOTE: browse.ts's single-page truncation is fixed in Phase 4d, which
adopts this paginated reader.

> **Design pivot (2026-07-09, from the mockup):** the recipe page stays the simple landing;
> the **inline version flip is the PRIMARY mechanism** and the `dish.html` grid is the secondary
> **"View All"**. Reference mockups: `docs/mockups/recipe-flip-mockup.html` (primary) +
> `docs/mockups/dish-mockup.html` (grid). Comments stay **per-version** (no model change);
> dish-level shared comments are a **Deferred TODO**. See the reordered phases below.

### Phase 4b: `dish.html` compare grid — the "View All" target (build wiring, main risk) — COMPLETE 2026-07-09
**Outcome:** New `src/pages/dish.ts` + top-level `dish.html`; `scripts/build.mjs` PAGES+HTML wired
(build emits `dist/dish.html` + a hashed `dish` bundle, verified). `dish.html?key=<dishKey>&did=<did>&by=<handle>`
resolves the repo PDS, paginates `listRecords`, `siblingsOf(key)`, sorts (primaryVersion first then
rkey), verifies via cache.put, and renders `renderDishCompare` (new in view.ts): dish title + "N
versions" + pooled/deduped fun facts + a grid of version compare cards (versionLabel badge, photo,
chips, links to each version's recipe page). 2 happy-dom unit tests + 3 e2e (`tests/e2e/dish.spec.ts`
with `listRecords-versions.json` fixture): grid renders 2 cards, primary sorts first, pooled facts
1/2, card links to recipe.html, unknown key → "No versions found". Docs updated same-phase
(`README.md` page list + `docs/DESIGN.md`). Full 216 unit + build + dish e2e green.
**Goal:** New `dish.html?key=<dishKey>` grid page (the mockup's compare view): uses 4a's paginated
reader + grouping to list a dish's versions **side by side as compare cards** (photo, versionLabel,
at-a-glance times/serves/ingredient-count, source, "View full recipe →"), with the pooled fun-fact
cycler at top (subject to the Settings toggle, Phase 5). It's reached from the recipe page's
**View All** button (Phase 4c), not the primary path. **Build wiring (REQUIRED):** add `'dish'` to
`PAGES` and `'dish.html':'dish'` to `HTML` in `scripts/build.mjs`; create top-level `dish.html`
(mirroring `recipe.html`, refs `./dish.js` + `./styles.css`); SW precache picks it up via `HTML`.
**Read-set:** `read.ts`, `model.ts`, `view.ts`, `recipe.html`. **Write-set:** `src/pages/dish.ts`
(new), `dish.html` (new), `scripts/build.mjs` (PAGES+HTML), **`README.md:31-36`** (add `dish.html`),
**`docs/DESIGN.md`** (version model + View-All grid) + e2e spec. **Shared-state:** none. Doc
updates happen in THIS phase. **Wiring test:** e2e — `npm run build` emits `dist/dish.html` + a
hashed `dish` bundle (assert file exists); a `dishKey` with 2+ versions renders the compare cards;
1 member renders gracefully; a method-dual dish shows both method siblings.
**Verification:** `npm run build && npx playwright test tests/e2e/dish.spec.ts`. **Validation:** Broad.

### Phase 4c: Inline version flip on the recipe page — PRIMARY UX
**Goal:** On `recipe.ts`, discover the current record's siblings by `dishKey` (4a's paginated reader
+ `siblingsOf`) and render the **version control bar above the banner**: `‹ N of M ›` cycler (shown
ONLY when M > 1) on the left, **▦ View All** (→ `dish.html?key=`) on the right. Flipping swaps the
banner image, title, lede, ingredients, instructions, and provenance **in place**; the pooled fun
facts and the (per-version) comments do NOT belong to the swap — fun facts are dish-pooled, comments
are per current version. **Landing/flip order = a stable default** — `primaryVersion` first, then
published/rkey order. (Most-liked-first ordering is a **Deferred TODO** — avoids fetching per-sibling
like counts on load for now.) **Read-set:** `read.ts`, `model.ts`. **Write-set:**
`src/pages/recipe.ts` + `src/recipes/view.ts` (control bar + swap) + e2e/unit. **Shared-state:** none.
**Wiring test:** e2e — a 2+-version recipe shows the bar; `›` swaps image+ingredients+instructions;
a single-version recipe shows NO bar; View All links to the right `?key=`. **Edges:** M=1 → no bar;
ordering by likes with a tie/absent-counts fallback. **Verification:** `npm run build && npx
playwright test tests/e2e/recipes.spec.ts`. **Validation:** Broad.

### Phase 4d: ⛶ Focus mode (full-screen cook view)
**Goal:** Add a **⛶ Focus** button to the recipe control bar (next to View All) that opens a
distraction-free full-screen view of ONLY the current version's image + ingredients + instructions
(no header/nav/fun-facts/comments), larger type; Exit button + `Esc` close it; uses the Fullscreen
API with a fixed-overlay fallback. **Read-set:** `model.ts`. **Write-set:** `src/pages/recipe.ts` +
`src/recipes/view.ts` (focus overlay + button) + `styles.css` (focus styles) + e2e/unit.
**Shared-state:** none (transient fullscreen; restores on exit). **Wiring test:** e2e — clicking
Focus shows the overlay with the current version's ingredients/instructions; Esc/Exit restores;
flipping version then Focus shows the new version. **Edges:** Fullscreen API absent → overlay still
covers viewport. **Verification:** `npx playwright test tests/e2e/recipes.spec.ts`. **Validation:** Moderate.

### Phase 4e: Browse version-collapse + pagination (Pass 2 — confirmed)
**Goal:** browse.ts groups records by `dishKey` (4a's helper) and renders **one card per dish** with
a "N versions" badge linking to `dish.html?key=`; adopts 4a's paginated reader so all ~177 records
are reachable (the ~50 truncation is already gone from 4a — this adds the collapse UI). Single-version
dishes render as a normal card (no badge). **Read-set:** `read.ts`, `model.ts`. **Write-set:**
`src/pages/browse.ts` (+ `browse-state.ts` if the feed shape changes) + `tests/e2e/browse.spec.ts`.
**Shared-state:** none. **Wiring test:** e2e — a multi-version dish shows one badged card; click opens
`dish.html`; pagination loads beyond page 1. **Edges:** single-version → no badge; multi → correct
count; existing `browse.spec.ts` assertions stay green. **Verification:** `npm run build && npx
playwright test tests/e2e/browse.spec.ts`. **Validation:** Broad (landing page; regression-sensitive).

### Phase 5: Settings "Include fun facts" toggle
**Goal:** Add an **Include fun facts** toggle to `settings.ts` (client-side preference, **ON by
default**, same localStorage pattern as theme/diet-preference); when off, fun facts are hidden
**everywhere** — the recipe page cycler (Phase 3) and the `dish.html` pooled facts (Phase 4b).
`renderFunFacts` callers gate on the preference. **Read-set:** `settings.ts`, `view.ts`. **Write-set:**
`src/pages/settings.ts` + a small pref module (e.g. `src/recipes/preferences.ts` or reuse existing) +
the gate at the `renderFunFacts` call sites + unit/e2e. **Shared-state:** localStorage key.
**Wiring test:** unit — pref defaults ON; toggling off makes the gate return no fun facts; e2e —
toggling in Settings hides the cycler on a recipe. **Edges:** unset pref → treated as ON.
**Validation:** Moderate.

### Phase 6: Migration ops + pilot publish → bulk
**Depends on:** Phase 1b (`dishkeys.json`) and the UI phases (so the pilot renders). Uses
`funFacts` pooled **per dishKey across live + imported** (Pass 2). **Goal:**
- (a) `spike/import/add-funfacts-dishkey.mjs` adds `funFacts` (converted from the live record's
  single `pds-funfacts.json` fact + any pooled siblings) + `dishKey` (from `dishkeys.json`) to
  the 41 live records — dry-run first, idempotent, preserve `createdAt`, bump `updatedAt`.
- (b) a publisher that, per imported record: maps `dish`→`dishKey` (via `dishkeys.json`),
  converts `funFact`(string)→`funFacts[]`, **pools funFacts per dishKey across the dish's
  versions incl. live records** and denormalizes the union onto each, assigns `versionLabel`
  (source/style; for desserts **splits `methods[]` into two sibling records** with method
  labels sharing the recipe's dishKey), and attaches images (`image-choices-corpus.json`).
- (c) publish a **pilot batch** (one multi-version group — e.g. banana bread across live +
  imported — plus a few singles), verify end-to-end on live records, **then** bulk-publish.
**Read-set:** `spike/import/*.json`, `dishkeys.json`, `pds-funfacts.json`, `image-choices-corpus.json`,
live PDS. **Write-set:** `spike/import/add-funfacts-dishkey.mjs`, `spike/import/publish-*.mjs`
(+ tests) — **and LIVE records on arecipe.bsky.social** (the only ambient/live mutation in the
plan). **Shared-state:** live PDS repo — dry-run + idempotent + pilot-before-bulk are the
guards; no other phase writes live. **Edges (mutation-resistant):** funFacts pooling **dedupes
identical facts** and unions across N versions; a dish with 1 fact → `funFacts` length 1; a
version with no fact → contributes nothing (no empty entry); re-running the migration is
idempotent (no dupe facts, no dupe records — check by `dishKey`+`versionLabel`). **Logging /
checkpoints:** dry-run prints, per record, the planned `dishKey` + funFacts count + versionLabel;
the live run logs each created/updated URI; **the pilot is an explicit STOP-and-verify checkpoint
before bulk** (confirm on bsky.app + `dish.html`). **Wiring test:** dry-run prints planned edits;
pilot readback (`getRecord`) confirms fields persist, funFacts pooled/deduped correctly, images
attach, and `dish.html` renders the live group. **Validation:** Broad (live writes; dry-run +
idempotent + pilot-before-bulk; confirm first).

## Resolved Decisions (2026-07-09)

All seven open questions were walked through and decided:

1. **Lexicon strategy → open-world first, overlay fallback, amendment as future TODO.**
   Tier 1 open-world fields if the Phase 0 D1 probe passes; tier 2 `app.arecipe.*` overlay
   record if the PDS rejects unknown fields; tier 3 formal amendment deferred.
2. **Version grouping → self-contained records by `dishKey`.** No separate `dish` record;
   each version carries `dishKey` + `versionLabel` + denormalized `funFacts[]`.
3. **Sibling discovery → `dishKey` grouping over the single-repo feed / `listRecords`.**
   Optional sibling-URI denormalization deferred (needs two-pass publish). Confirm in D2.
4. **Fun facts → `funFacts[]` denormalized per record** (plurality; per-record self-describing).
5. **Methods → unified with versions.** No `methods[]` field; a dual-method recipe = two
   version records with method `versionLabel`s. Method-toggle phase removed.
6. **Switcher UI → REVISED 2026-07-09 (mockup):** inline flip is **primary** (Phase 4c) with a
   `‹ N of M ›` bar above the image + `⛶ Focus` (Phase 4d); the `dish.html` grid is the secondary
   **View All** (Phase 4b). Adds a Settings **Include fun facts** toggle (Phase 5). Comments stay
   per-version; **dish-level comments deferred** (see Deferred TODOs). Supersedes the "deep page
   first" call.
7. **Publish scope → pilot batch first, then bulk** (Phase 6).

## Deferred TODOs (out of scope for this plan)

- **Dish-level shared comments.** Comments currently attach per-version (`app.arecipe.comment` →
  one record's AT-URI). A nicer model shares one comment thread across a dish's versions (keyed by
  `dishKey`). Deferred 2026-07-09 (user call) — it reworks the live comments model and warrants its
  own plan. For now, flipping versions shows that version's own comments.
- **Remember-a-default version.** The compare/flip is navigate-only; persisting a user's preferred
  version per dish (localStorage) is a possible later enhancement.
- **Most-liked-first version ordering.** Phase 4c lands a stable default order (`primaryVersion`
  then published). Ordering the flip by per-version like counts (from `interactions.ts`) is
  deferred — it adds per-sibling like-count reads on recipe load (user call 2026-07-09).

## Open Questions (reopened + resolved in Pass 2, 2026-07-09)

- [CONFIRMED: BLOCKING → **Yes, group live + imported**] **Cross-set grouping scope.** One
  `dishKey` spans both sets; a dish's versions and pooled fun facts include live + imported
  records together (e.g. live "Beef Bourguignon" + imported boeuf-bourguignon; "Banana Bread"
  across live/artisan/frugal/own). The 41 live records get dishKeys reconciled against the
  import corpus in Phase 1b (confirmed dish-by-dish in the review report).
- [CONFIRMED: PHASE-GATED → **Collapse versions + pagination**] **Browse presentation.** Browse
  shows **one card per `dishKey`** with a "N versions" badge linking to `dish.html`, plus cursor
  pagination (fixes the ~50-of-177 truncation). This is a larger browse change → **new Phase 4d**.
- [CONFIRMED: PHASE-GATED → **Auto-propose + user review**] **dishKey normalization ownership.**
  Phase 1b script proposes keys (slugify + alias table) + a review report; user confirms/edits.
  Must catch the mangled julia slugs and the mislabeled `banana-bread-mug-cake`.

## Review Log

### Pass 1: Plan development — 2026-07-09
Built the base from the recipe-model-extensions memory + codebase grounding (lexicon def,
recipe.ts single-record load, view.ts render, import JSON shapes). Chose open-world additive
fields + `dishKey` grouping + `funFacts[]` + optional `methods[]`, all pending a Phase 0
PDS-validation probe. Surfaced 7 open questions (2 BLOCKING: lexicon strategy, grouping
mechanism). Sequential plan (UI phases share view.ts/recipe.ts). Migration for the 41 live
records + `pds-funfacts.json` scheduled in Phase 7.

### Pass 1 decision walk-through — 2026-07-09
Walked all 7 open questions with the user; recorded resolutions in **Resolved Decisions**.
Three materially changed the plan: **methods = versions** (removed the standalone method-
toggle phase; dessert `methods[]` now splits into sibling records at publish), **compare-
and-pick page first** (old optional Phase 6 promoted to primary Phase 4; inline flip demoted
to optional Phase 5), and **self-contained records** (denormalized `funFacts[]` + `dishKey` +
`versionLabel`, no separate `dish` record). Also: overlay (`app.arecipe.*`) is the explicit
tier-2 fallback if the D1 probe fails; publish is pilot-then-bulk. Phases renumbered 0–6;
Documentation Impact now flags a new `dish.html` page. Ready for Pass 2 (gap analysis) or
Phase 0 execution.

### Phase 0 execution — 2026-07-09
Ran all three discovery tasks. **D1:** live createRecord/getRecord/delete probe against
arecipe.bsky.social proved the PDS accepts open-world extras (`dishKey`, `versionLabel`,
`primaryVersion`, `funFacts[]`) intact with matching CID — **tier 1 confirmed, overlay
fallback not needed.** **D2:** `read.ts` already open-world (no parser changes for the new
fields); discovery = client-side `dishKey` grouping over `listRecords`. Surfaced a real gap —
`createRecipeReader` doesn't paginate (single ~50-record page), added as a Phase 4 prereq.
**D3:** ownership confirmed (arecipe is a consumer; open-world, no amendment). All BLOCKING
unknowns resolved; the plan's schema strategy holds. Next: Pass 2 gap analysis, or begin
Phase 1 (schema/types).

### Pass 2: Gap Analysis — 2026-07-09
**Found:**
- **Data foundation gap (biggest):** the "12 alt-version groups via `altOf`/`dishKey`" premise
  is false. `dish`/`altOf` are inconsistent across the 6 files (own-batch: neither; artisan:
  free-text `altOf`; julia: mangled slug + scrambled `altOf`; same dish → different slug per
  file). Grouping by them yields **1** group (boeuf-bourguignon), not 12. Versions + fun-fact
  pooling have no usable key today.
- Version groups + fun-fact pools span **live + imported** (41 live records overlap imported
  dishes: Banana Bread, Beef Bourguignon, Mac and Cheese, Apple Pie, Caesar Salad, Enchiladas…).
- Import JSON has `funFact` **singular**, not `funFacts[]` → conversion + per-dishKey pooling
  needed at publish.
- **Build wiring:** a new `dish.html` requires editing `scripts/build.mjs` (`PAGES` + `HTML`)
  and creating the top-level `dish.html` — an Isolation-Trap risk the Pass-1 Phase 4 omitted.
- **Phase 4 oversized** (6+ files) — violates the 4-file rule.
- `pds-funfacts.json` verified valid (`{_meta, funFacts:[{rkey,name,funFact}×41]}`);
  `renderRecipeDetail(entry, options)` verified as the single render path (recipe.ts:390/405).
**Concurrency:**
- Map re-derived for renumbered phases; still **all sequential**. Documented that 2/3/4c share
  `view.ts` (cannot parallelize) and 6 is the only live-mutating phase. Considered 1b‖1/2 and
  rejected (1b gates 4b/6 + needs a review checkpoint). Added per-phase Read/Write-set +
  Shared-state contracts to every phase.
**Changed:**
- **Added Phase 1b** (canonical `dishKey` normalization across all 177 records, user-reviewed
  `dishkeys.json`) as a prereq for Phases 4 & 6.
- **Split Phase 4 → 4a** (paginated reader + grouping helper), **4b** (dish.html + build wiring),
  **4c** (recipe "other versions" link + `RenderOptions` field).
- Expanded Phase 6: `funFact`→`funFacts[]` conversion, per-dishKey pooling across live+imported,
  `dish`→`dishKey` mapping via `dishkeys.json`, image attach, dessert `methods[]`→sibling split.
- Corrected Problem Statement bullet 1 + Verified Assumptions (dish/altOf reality, funfacts
  shape, build wiring, render signature).
- **Reopened 3 open questions** (cross-set grouping scope [BLOCKING], browse presentation +
  pagination, dishKey normalization ownership).
**Confirmed:**
- Open-world reads need no parser changes (read.ts already tolerant). Phase 1 types are additive.
- `renderRecipeDetail` is the single detail-render path → fun facts + versions link wire once.
- No pre-existing funFact/version UI → no in-app back-compat burden.

### Pass 2 question walk-through — 2026-07-09
All 3 reopened questions confirmed with the user: (1) **cross-set grouping = YES** — one dishKey
spans live + imported. (2) **browse = collapse versions + pagination** (the larger option) →
**added Phase 4d** (one badged card per dish; browse adopts the paginated reader). (3) **dishKey
= auto-propose + user review** (Phase 1b). Concurrency spine updated to include 4d (kept
sequential; depends on 4a and points at 4b's dish.html).

### Pass 3: Quality Gates — 2026-07-09
**TDD ordering:** Added a test-first preamble to the Phases section (every phase RED→GREEN;
wiring test written failing first). Flagged Phases 1 & 2 as foundational component phases whose
entry-point wiring is intentionally exercised in Phases 3/4 (not a missing wiring test).
**Observability:** Added logging notes — 4a paginator logs `{pages, total}`; Phase 6 dry-run
logs per-record planned `dishKey`/funFacts count/versionLabel and the live run logs each URI.
**Debugging readiness:** Phase 6 pilot made an explicit STOP-and-verify checkpoint before bulk;
idempotency re-run check added.
**Validation calibration:** Confirmed calibration — narrow (unit) for 1/2/4a; broad (build+e2e)
for 4b/4d; broad+live for 6. Added explicit `Verification:` commands to 1b/4a/4b/4c/4d.
**Mutation resistance:** Named boundary/edge cases for every branching phase — 1b (single vs
multi, no false merge, mug-cake not pooled), 4a (0/1/2-page pagination, group size 1 vs 2+),
4c (siblingCount 0/1/2+), 4d (badge only when >1; browse.spec regression guard), 6 (funFacts
dedupe/union, idempotent re-run).
**Concurrency honesty:** Map confirmed; sequential plan. All 10 phases accounted for; per-phase
write-sets present; no parallel sets (so no invariant/re-entry checks needed). 4d is write-
disjoint from the view.ts phases but kept sequential (depends on 4a; links to 4b's dish.html).
**Discovery:** Phase 0 complete; all D-tasks concrete, answered firsthand, dispositions declared
(`throwaway`), outputs wired to Verified Assumptions.
**Coherence:** Plan still solves the stated problem. Scope grew (Phase 1b, 4d) but each traces to
a confirmed decision or a Pass-2 data-reality finding — not creep.
**Documentation impact:** `docs/DESIGN.md` + `README.md:31-36` both pinned to Phase 4b (same
phase that makes `dish.html` real); `scripts/build.mjs` wiring in 4b. No end-of-plan docs phase.
**Confirmed ready:** YES. All 10 open questions (7 Pass-1 + 3 Pass-2) user-confirmed; no
unresolved BLOCKING items (the BLOCKING lexicon question was settled by D1; cross-set grouping
is a confirmed YES implemented via Phase 1b's review checkpoint). Ready to execute Phase 1.

### Design revision (mid-execution, mockup-driven) — 2026-07-09
After Phases 0–4a shipped, the user reviewed static mockups (`docs/mockups/recipe-flip-mockup.html`,
`docs/mockups/dish-mockup.html`) and **inverted the version-switcher UX**:
- **Inline flip is now PRIMARY** (Phase 4c) — a `‹ N of M ›` bar above the banner that swaps
  image/title/ingredients/instructions in place; `⛶ Focus` full-screen cook view added (Phase 4d).
- **`dish.html` grid demoted to secondary "View All"** (Phase 4b) — still built (it's the View All
  target + carries the build-wiring risk), just no longer the entry point.
- **Old "other versions link" phase folded** into 4c's control bar.
- **New Settings "Include fun facts" toggle** (Phase 5, on by default, gates fun facts everywhere).
- **Comments stay per-version**; dish-level shared comments moved to **Deferred TODOs** (user call —
  avoids reworking the live `app.arecipe.comment` model now).
- **Landing/flip order = stable default** now (`primaryVersion` then published); most-liked-first
  ordering and dish-level comments both moved to Deferred TODOs; Focus uses the Fullscreen API with
  a full-viewport overlay fallback.
Phases 0–4a unaffected (model, fun-fact render+wire, pagination+grouping all stand). Spine is now
0→1→1b→2→3→4a→4b→4c→4d→4e→5→6. Mockups committed to `docs/mockups/` as the reference artifacts.
Ready to resume at Phase 4b.
