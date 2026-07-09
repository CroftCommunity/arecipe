# Recipe model extensions — alternative versions, multiple fun facts, dual methods

**Status:** Pass 1 (design) — **all open questions resolved 2026-07-09** (see Resolved
Decisions). No code yet. Worktree `recipe-import-batch`.

## Problem Statement

The recipe corpus now holds **136 structured recipes** across 6 files plus **41 live
records** on arecipe.bsky.social. Three modeling needs have emerged that the current
`exchange.recipe.recipe` lexicon and the recipe page do not support:

1. **Alternative versions of the same dish (cross-source).** We deliberately keep
   *multiple* recipes for one dish rather than picking a "winner" — e.g. chocolate
   chip cookies exist in 3 batches, boeuf bourguignon in 2. 12 cross-file alt-version
   groups are already identified (via `altOf`/`dishKey`). The user wants a recipe-page
   **version switcher** (inline "flip", and/or a deeper compare-and-pick page).
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
- The record def does **not** declare `additionalProperties: false` in the fixture — but
  whether the live PDS *validates* unknown fields on putRecord is **UNVERIFIED** (Phase 0).
- `src/pages/recipe.ts` loads a single record by `recipe.html?u=<at-uri>`, cache-first,
  resolves DID→PDS→getRecord, `cache.put`, renders `renderRecipeDetail(entry,{author})`
  (read `recipe.ts`); it has **no** sibling-version discovery today.
- `src/recipes/view.ts` `renderRecipeDetail` builds the detail DOM; `chipsEl`/`recipeFacets`
  and the trust surface exist (read in full earlier).
- Import JSON already carries `dish` slug, `altOf` (12 cross-file groups), and dessert
  `methods[]`; `pds-funfacts.json` has facts for all 41 live records keyed by rkey.
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

Sequential spine: Phase 0 → 1 → 2 → 3 → 4 → (5) → 6. The UI phases (2–5) all touch
`view.ts` and/or `recipe.ts`/`dish.ts` (shared write-set) so they are sequential. Phase 6
(migration + pilot publish) has a disjoint write-set (`spike/import/*` + live PDS) but is
listed last because publishing should follow the UI being able to render the new fields.
**All phases sequential** — write-sets overlap on `view.ts`/`recipe.ts` for the UI phases;
migration is gated on the schema decision (Phase 0/1).

## Phases

### Phase 0: Discovery (BLOCKING gate for the schema strategy)
**Goal:** Settle the three unknowns that shape every later phase.
- [ ] **D1: Does the PDS accept extra/unknown fields on `exchange.recipe.recipe`?**
  - **Probe:** With `.env` creds, `putRecord` a THROWAWAY test record to arecipe.bsky.social
    carrying `funFacts: [...]`, `dishKey`, and `methods: [...]`; read it back via getRecord;
    confirm the fields persist and CID verification still passes; then delete the test record.
  - **Success criteria:** Extra fields survive round-trip and verify → open-world path is
    viable. Rejected/stripped → fall back to lexicon amendment / permissive nesting.
  - **Disposition:** `throwaway` (delete the probe record; keep the finding).
- [ ] **D2: How does the recipe page discover sibling versions?**
  - **Probe:** Read `recipe.ts` + the Browse feed cache path; confirm whether the browse
    `CachedRecipe[]` is reachable from the recipe page (session/cache) and whether a
    `dishKey`-filtered lookup is feasible without excessive fetches.
  - **Success criteria:** A concrete discovery mechanism (in-memory group, active lookup,
    or hybrid) chosen and its fetch cost understood.
  - **Disposition:** `throwaway`.
- [ ] **D3: Lexicon ownership/strictness.** Confirm from FACTCHECK/ECOSYSTEM whether arecipe
  may extend `exchange.recipe.*` or must stay open-world. **Disposition:** `throwaway`.
**Done when:** D1–D3 resolved with firsthand evidence; the schema strategy (open-world vs
amendment) and discovery mechanism are chosen; later phases updated to match.

### Phase 1: Schema + shared types
**Goal:** Lock the field shapes (`dishKey`, `versionLabel`, `funFacts[]` of `{text, source?}`,
optional `primaryVersion`) as shared TS types + JSON-schema notes; align the import JSON
`_meta`. **No `methods[]`** — methods are versions. If D1 chose the overlay, also define the
`app.arecipe.*` overlay record shape. **Changes:** shared types module (e.g.
`src/recipes/model.ts`); overlay-record type/fixture if applicable. **Wiring test:** a
type-level + unit test that a record with the new fields parses and the old records (no new
fields) still parse. **Validation:** Narrow.

### Phase 2: Fun-fact renderer (view)
**Goal:** `renderFunFacts(facts): HTMLElement` — a "Did you know?" element that cycles
`funFacts[]` (next/prev or shuffle), omitted when empty. Render-only. **Wiring test:** none
(gated by Phase 3). **Validation:** Narrow (happy-dom unit tests).

### Phase 3: Fun-facts on the recipe page (wired) + pooling
**Goal:** recipe.ts passes the record's `funFacts` into `renderRecipeDetail`; the cycler
shows on real records. (Facts are denormalized per record, so no cross-record pooling needed
at read time.) **Wiring test:** e2e — a recipe with multiple facts shows the cycler and
advances. **Validation:** Moderate.

### Phase 4: Compare-and-pick page (`dish.html`) — PRIMARY version mechanism, main risk
**Goal:** New `dish.html?key=<dishKey>` page: discovers a dish's version records by `dishKey`
(mechanism from D2 — feed grouping / `listRecords` filter over the single repo), lists them
**side by side** to compare and pick (this is where method-labeled siblings — "Microwave" vs
"Oven" — surface too), and pools the fun facts across them with the same compare/pick pattern.
The recipe page (`recipe.ts`) gains an "other versions →" link to `dish.html` when a record's
`dishKey` has siblings. **Changes:** new `src/pages/dish.ts` + `dish.html` entry; a small
addition to `recipe.ts`/`view.ts` for the link. **Wiring test:** e2e — a dish with 2+ versions
renders the compare page with all versions and switching/picking works; a method-dual dish
shows both method siblings. **Validation:** Broad.

### Phase 5 (optional): Inline version flip on the recipe page
**Goal:** Secondary convenience — an inline version toggle on `recipe.ts` that swaps the
detail in place without visiting `dish.html`. Only if wanted after Phase 4. **Wiring test:**
e2e — inline toggle swaps content. **Validation:** Moderate.

### Phase 6: Migration ops + pilot publish → bulk
**Goal:** (a) `spike/import/add-funfacts-dishkey.mjs` adds `funFacts` (from `pds-funfacts.json`)
+ `dishKey` to the 41 live records (dry-run first, idempotent, preserve `createdAt`); (b) a
publisher that **splits dessert `methods[]` into sibling version records** (method
`versionLabel`) and carries `dishKey`/`funFacts`/`versionLabel` on every imported record;
(c) publish a **pilot batch** (one version group + a few singles), verify end-to-end on live
records, **then** bulk-publish the rest. **Wiring test:** dry-run prints planned edits;
pilot readback confirms fields persist, images attach, and the compare page renders the live
group. **Validation:** Broad (live writes; confirm first, pilot before bulk).

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
