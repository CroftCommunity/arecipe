# Recipe model extensions — alternative versions, multiple fun facts, dual methods

**Status:** Pass 1 resolved · Phase 0 discovery COMPLETE · **Pass 2 gap analysis COMPLETE
2026-07-09** — added Phase 1b (dishKey normalization), split Phase 4 → 4a/4b/4c (build wiring),
expanded Phase 6 (funFact→funFacts pooling); reopened 3 questions (1 BLOCKING: cross-set
grouping). No feature code yet. Next: confirm the 3 reopened questions, then Pass 3 or Phase 1.
Worktree `recipe-import-batch`.

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

**UI shape (recipe.ts + view.ts) — compare-and-pick page first (DECIDED).** The **primary**
mechanism is a dedicated `dish.html?key=<dishKey>` **compare-and-pick page** that lists a
dish's versions side by side (and, with the same pattern, its multiple fun facts) so the
reader deliberately compares and picks. An inline flip on the recipe page is a **secondary,
optional** enhancement (later phase), not the first thing built. `renderRecipeDetail` still
gains optional slots (fun-fact element, "other versions" link to the compare page) and stays
backward-compatible when the new fields are absent.

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
  versions) and the `dish.html` compare-and-pick page + fun-fact cycler, when the UI phases
  land (scheduled in Phases 3–4, not deferred).
- **README page inventory — CHANGES.** Phase 4 adds a new top-level `dish.html` page; the
  page list / build entry-points doc must gain it (handled in Phase 4). This supersedes the
  earlier "no README change" note.
- `tests/fixtures/lexicons/exchange.recipe.recipe.json` — only if D1 forces a formal lexicon
  extension (unlikely given the open-world/overlay decision); otherwise untouched.
- If D1 selects the overlay, a new `app.arecipe.*` lexicon fixture/doc (Phase 1).
- `spike/import/*.json` `_meta` — note the fields became live (in the publish phase).

## Concurrency Map

Sequential spine: Phase 0 → 1 → 1b → 2 → 3 → 4a → 4b → 4c → (5) → 6.
**All phases sequential.** Rationale from the per-phase write-sets: Phases 1/1b write `model.ts`
which 2/3/4a read; Phases 2/3/4c all write `src/recipes/view.ts` (shared write-set → cannot
parallelize); 4b depends on 4a's paginator+grouping and edits `scripts/build.mjs`; 6 depends on
`dishkeys.json` (1b) and the UI phases (to render the pilot) and is the only phase that mutates
live PDS state. **Candidate parallelism considered and rejected:** 1b (spike tooling) is
write-disjoint from 1/2 (src) and *could* run alongside them — but it gates 4b/6 and needs its
own user-review checkpoint, so it stays on the spine. No worktree/parallel dispatch planned;
if adopted later, the only live-mutating phase (6) must never run concurrently with anything.

## Phases

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

### Phase 1: Schema + shared types
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

### Phase 1b: Canonical dishKey normalization (NEW — Pass 2; prereq for Phases 4 & 6)
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
**Done when:** `dishkeys.json` exists, the user has reviewed the proposed groups, and every
imported + live record maps to exactly one `dishKey`. **Validation:** Moderate (human review of
groupings is the real gate). **Disposition:** `dishkeys.json` is kept (feeds Phase 6).

### Phase 2: Fun-fact renderer (view)
**Goal:** `renderFunFacts(facts): HTMLElement` — a "Did you know?" element that cycles
`funFacts[]` (next/prev or shuffle), omitted when empty. Render-only. **Wiring test:** none
(gated by Phase 3). **Validation:** Narrow (happy-dom unit tests).
**Read-set:** `model.ts`. **Write-set:** `src/recipes/view.ts` (add `renderFunFacts`) + a unit
test. **Shared-state:** none. **Done when:** `renderFunFacts([...])` returns a cycling element;
empty → returns null/omitted; `vitest run tests/unit/recipes` passes.

### Phase 3: Fun-facts on the recipe page (wired)
**Goal:** `renderRecipeDetail` reads `value.funFacts` and appends the Phase-2 cycler; recipe.ts
needs no change (facts are denormalized on the record). Cycler shows on real records.
**Read-set:** `model.ts`, `view.ts`. **Write-set:** `src/recipes/view.ts` (wire the cycler into
`renderRecipeDetail`) + e2e spec. **Shared-state:** none. **Wiring test:** e2e (`tests/e2e/`) —
load a recipe fixture with multiple facts; the cycler shows and advances. **Validation:** Moderate.

### Phase 4a: Paginated reads + version-grouping helper (prereq for 4b/4c)
**Goal:** (1) extend `createRecipeReader` (read.ts:64) with **cursor pagination** (loop
`limit=100` + `cursor`, like `publish-batch.mjs`) so all of a dish's siblings are fetched — a
single ~50-record page would silently miss versions. (2) a pure `groupByDishKey(records)` /
`siblingsOf(dishKey, records)` helper in `model.ts`. **Read-set:** `read.ts`. **Write-set:**
`src/recipes/read.ts` + `src/recipes/model.ts` + their unit tests. **Shared-state:** none.
**Wiring test:** unit — paginator concatenates multi-page `listRecords` (mock 2 pages); grouping
buckets by `dishKey`. **Validation:** Moderate. NOTE: browse.ts also uses the single-page reader
(pre-existing ~50 truncation) — see Open Question on whether browse adopts pagination here.

### Phase 4b: Compare-and-pick page (`dish.html`) — PRIMARY version mechanism, main risk
**Goal:** New `dish.html?key=<dishKey>` page: uses 4a's paginated reader + grouping to list a
dish's version records **side by side** to compare and pick (method-labeled siblings —
"Microwave"/"Oven" — surface here too), pooling the dish's fun facts with the same compare/pick
pattern. **Build wiring (Pass 2 — REQUIRED):** add `'dish'` to `PAGES` and `'dish.html':'dish'`
to `HTML` in `scripts/build.mjs`, and create the top-level `dish.html` (referencing `./dish.js`
+ `./styles.css`, mirroring `recipe.html`); SW precache picks it up via the `HTML` map.
**Read-set:** `read.ts`, `model.ts`, `view.ts`, `recipe.html`. **Write-set:** `src/pages/dish.ts`
(new), `dish.html` (new), `scripts/build.mjs` (edit PAGES+HTML) + e2e spec. **Shared-state:**
none. **Wiring test:** e2e — `npm run build` emits `dist/dish.html` + a hashed `dish` bundle; a
`dishKey` with 2+ versions renders the compare page and picking swaps content; a method-dual
dish shows both method siblings. **Validation:** Broad (build + serve + e2e, not just unit).

### Phase 4c: "Other versions" link from the recipe page
**Goal:** recipe.ts discovers whether the current record's `dishKey` has siblings (via 4a) and,
if so, `renderRecipeDetail` shows an "other versions →" link to `dish.html?key=`. Requires a new
optional `RenderOptions` field (e.g. `siblingCount`/`dishKey`). **Read-set:** `read.ts`,
`model.ts`. **Write-set:** `src/pages/recipe.ts` + `src/recipes/view.ts` (RenderOptions + link) +
e2e/unit. **Shared-state:** none. **Wiring test:** e2e — a multi-version recipe shows the link;
a single-version one does not. **Validation:** Moderate.

### Phase 5 (optional): Inline version flip on the recipe page
**Goal:** Secondary convenience — an inline version toggle on `recipe.ts` that swaps the
detail in place without visiting `dish.html`. Only if wanted after Phase 4b/4c. **Write-set:**
`src/pages/recipe.ts` + `src/recipes/view.ts` + e2e. **Shared-state:** none. **Wiring test:**
e2e — inline toggle swaps content. **Validation:** Moderate.

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
guards; no other phase writes live. **Wiring test:** dry-run prints planned edits; pilot
readback confirms fields persist, funFacts pooled correctly, images attach, and `dish.html`
renders the live group. **Validation:** Broad (live writes; confirm first, pilot before bulk).

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
6. **Switcher UI → deep compare-and-pick page first (Phase 4, primary);** inline flip is a
   secondary optional Phase 5.
7. **Publish scope → pilot batch first, then bulk** (Phase 6).

## Open Questions (reopened in Pass 2)

- [RECOMMENDED: BLOCKING (Phase 1b)] **Cross-set grouping scope.** Should live records group
  with imported ones under a shared `dishKey` (e.g. live "Beef Bourguignon" + imported
  boeuf-bourguignon; "Banana Bread" ×4 across live/artisan/frugal/own)? This defines the
  version groups AND the fun-fact pools. *Recommend yes (group live+imported), confirmed via the
  Phase 1b review report — but it's the user's curation call, dish by dish.*
- [RECOMMENDED: PHASE-GATED (Phase 4a)] **Browse presentation of multi-version dishes + browse
  pagination.** Post-import, browse will show N separate cards for a multi-version dish and (with
  no pagination) truncate at ~50 of 177 records. Options: (a) leave browse as-is (every version
  is its own card) + add pagination; (b) collapse versions into one card with a count badge.
  *Recommend (a)+pagination for v1; collapsing is a larger browse change. Pre-existing 50-cap is
  a real bug surfaced here.*
- [RECOMMENDED: PHASE-GATED (Phase 1b)] **dishKey normalization ownership.** Auto-derived
  (slugify + alias table) with user review, vs a fully hand-curated map. *Recommend
  auto-propose + user-review (the review report is the gate); mangled slugs (julia) and
  mislabels (`banana-bread-mug-cake`) must be caught.*

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
