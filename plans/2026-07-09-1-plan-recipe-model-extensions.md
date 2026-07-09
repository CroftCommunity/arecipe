# Recipe model extensions — alternative versions, multiple fun facts, dual methods

**Status:** Pass 1 (design). No code. Worktree `recipe-import-batch`.

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

**Lexicon strategy — open-world additive fields (recommended), pending a Phase 0 probe.**
The `exchange.recipe.recipe` record def lists `required: [name, text, ingredients,
instructions, createdAt, updatedAt]` and a fixed property set (no `additionalProperties:
false` observed). AT Protocol records commonly tolerate extra fields (open-world), and
arecipe already treats the schema open-world (browse filters read fields defensively).
Since arecipe does **not own** the lexicon, the low-friction path is to add **extra
fields** (`funFacts`, `methods`, `dishKey`) that recipe.exchange ignores and arecipe
consumes — rather than blocking on a coordinated lexicon amendment. **This hinges on
whether the PDS accepts unknown fields on a putRecord for this `$type`** — a Phase 0
probe settles it. If the PDS rejects unknown fields, fall back to coordinating a lexicon
amendment with recipe.exchange (slower) or nesting extras where the schema is permissive.

**Versions — a shared `dishKey` slug on each record (recommended).** Grouping records
that are alternative versions of one dish can be done three ways:
- *(A) `dishKey` string on each record* — a stable slug ("chocolate-chip-cookies"). The
  client groups records with the same key. No cross-record write coordination; each
  record is self-describing. Already prototyped as `dish`/`altOf` in the import JSON.
- *(B) a separate `exchange.recipe.dish` collection record* listing member AT-URIs —
  more expressive (ordering, canonical pick) but adds a second record type, write
  coordination, and a new lexicon. Heavy for a backendless client.
- *(C) client-side fuzzy name matching, no field* — fragile (we already saw normalization
  misses); rejected.
Chosen: **(A) `dishKey`**, optional `primaryVersion: boolean` for a default pick.

**Sibling-version discovery in a backendless client — the hard part.** `recipe.ts`
loads ONE record by AT-URI (cache-first → DID doc → PDS getRecord → `renderRecipeDetail`);
it has no notion of siblings today. To show a switcher it must *discover* the other
versions. Options:
- *(i) In-memory from the browse feed* — Browse already holds `CachedRecipe[]`; group by
  `dishKey` there and pass the sibling set into the recipe page via cache/session. Works
  when the user arrives from Browse; a cold shareable link has no feed.
- *(ii) Active resolution* — recipe.ts lists the author's records (and/or the starter
  authors) and filters by `dishKey`. Works for cold links but adds fetches.
Likely a hybrid: use the in-memory group when present, fall back to a `dishKey` lookup.
This is the main wiring risk and gets its own phase + Phase 0 confirmation.

**Fun facts — `funFacts[]` per record, pooled per-dish client-side (recommended).**
Each record carries its own `funFacts[]` (array of `{ text, source? }`). The recipe page
pools facts across the dish's versions and offers a "Did you know?" cycler (next/random)
or pick. Keeping facts *on the record* (not in a separate dish record) means each version
is self-describing and the 41-record migration is a per-record field add. Alternative
(single `funFact` string) rejected — the whole point is plurality.

**Methods — optional `methods[]`, `instructions[]` stays canonical.** `instructions[]`
is lexicon-required, so it remains the default/primary method (back-compat, and what
recipe.exchange reads). Add optional `methods[]` = `[{ kind, label, appliance, steps[] }]`.
The recipe page shows a **method toggle** only when `methods[]` is present; otherwise it
renders `instructions[]` as today. The dessert JSON already has this shape.

**UI shape (recipe.ts + view.ts).** Three independent switches on the recipe page:
version (which recipe), method (how to make this version), and fun-fact cycler. Inline
controls first; a deeper `dish.html?key=<dishKey>` compare-and-pick page is a later,
optional phase. `renderRecipeDetail` gains optional slots for a method block, a fun-fact
element, and a version bar; it stays backward-compatible when the new fields are absent.

**Migration.** Once fields exist: (1) a Phase-9/fix-metadata-style op adds `funFacts`
(from `pds-funfacts.json`) + `dishKey` to the 41 live records (preserve `createdAt`, bump
`updatedAt`, idempotent, dry-run first); (2) publishing the 136 imported recipes carries
`dishKey`/`funFacts`/`methods` from the start. Publishing scope (all 136 vs a curated
subset) is an open question.

**Alternatives considered:** a full separate `dish` collection record (B above) — richer
but backend-heavy; rejected for now. Coordinating a formal lexicon amendment with
recipe.exchange up front — correct long-term, but blocks progress; deferred behind the
open-world probe. Client-only name grouping — fragile; rejected.

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

- `docs/DESIGN.md` — add a short section on the recipe-page version/method/fun-fact
  switchers when the UI phases land (scheduled in the UI phases, not deferred).
- `tests/fixtures/lexicons/exchange.recipe.recipe.json` — if we formally extend the
  lexicon (vs open-world), this fixture and any lexicon docs update in the schema phase.
- `spike/import/*.json` `_meta` — note the fields became live (in the publish phase).
- No README page-inventory change. Grepped intent: new UI is within the existing recipe
  page; no new top-level doc. (Full grep to run in Phase 0/execution.)

## Concurrency Map

Sequential spine: Phase 0 → 1 → 2 → 3 → 4 → 5 → (6) → 7. The UI phases (2–5) all touch
`view.ts` and/or `recipe.ts` (shared write-set) so they are sequential. Phase 7 (migration
ops) has a disjoint write-set (`spike/import/*` + live PDS) and could run independently
once the fields (Phase 1) are decided, but is listed last because publishing should follow
the UI being able to render the new fields. **All phases sequential** — write-sets overlap
on `view.ts`/`recipe.ts` for the UI phases; migration is gated on the schema decision.

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
**Goal:** Lock the field shapes (`dishKey`, `funFacts[]`, `methods[]`, optional
`primaryVersion`) as shared TS types + JSON-schema notes; align the import JSON `_meta`.
**Changes:** shared types module (e.g. `src/recipes/model.ts`); if amending the lexicon,
the fixture + a defs note. **Wiring test:** a type-level + unit test that a record with the
new fields parses and the old records (no new fields) still parse. **Validation:** Narrow.

### Phase 2: Fun-fact renderer (view)
**Goal:** `renderFunFacts(facts): HTMLElement` — a "Did you know?" element that cycles
`funFacts[]` (next/prev or shuffle), omitted when empty. Render-only. **Wiring test:** none
(gated by Phase 3). **Validation:** Narrow (happy-dom unit tests).

### Phase 3: Fun-facts on the recipe page (wired) + pooling
**Goal:** recipe.ts passes the dish's pooled `funFacts` (across discovered versions) into
`renderRecipeDetail`; the cycler shows on real records. **Wiring test:** e2e — a recipe with
multiple facts shows the cycler and advances. **Validation:** Moderate.

### Phase 4: Version discovery + switcher (wired) — main risk
**Goal:** recipe.ts discovers sibling versions by `dishKey` (mechanism from D2) and renders
a version bar; switching re-renders the detail for the chosen version. **Wiring test:** e2e
— a dish with 2+ versions shows the switcher and swaps content. **Validation:** Broad.

### Phase 5: Method toggle (wired)
**Goal:** When a record has `methods[]`, render a Rapid|Traditional toggle that swaps the
instruction block; fall back to `instructions[]` otherwise. **Wiring test:** e2e — a
dual-method recipe toggles methods. **Validation:** Moderate.

### Phase 6 (optional): Deeper compare-and-pick page
**Goal:** `dish.html?key=<dishKey>` lists all versions side by side to compare/pick.
Gated on user preference (Open Question). **Validation:** Moderate.

### Phase 7: Migration ops + publish
**Goal:** (a) `spike/import/add-funfacts-dishkey.mjs` adds `funFacts` (from
`pds-funfacts.json`) + `dishKey` to the 41 live records (dry-run first, idempotent, preserve
`createdAt`); (b) publish the imported recipes with the new fields. **Wiring test:** dry-run
prints planned edits; readback confirms. **Validation:** Broad (live writes; confirm first).

## Open Questions

- [RECOMMENDED: BLOCKING] Open-world extra fields vs a coordinated lexicon amendment with
  recipe.exchange. *Shapes every phase; D1 probes feasibility but the ownership call is the
  user's.*
- [RECOMMENDED: BLOCKING] Version grouping via a shared `dishKey` slug vs a separate
  `exchange.recipe.dish` collection record. *Determines Phases 1/4 and the migration.*
- [RECOMMENDED: PHASE-GATED (Phase 4)] Sibling-version discovery mechanism in the
  backendless client: in-memory browse group, active `dishKey` lookup, or hybrid. *Cold
  shareable links have no feed — affects fetch cost and cold-link behavior.*
- [RECOMMENDED: PHASE-GATED (Phase 2/3)] `funFacts[]` per record pooled client-side across
  versions (recommended) vs a single fact per record. *Recommend per-record array + pooling.*
- [RECOMMENDED: PHASE-GATED (Phase 4/6)] Version switcher UI: inline flip only, deeper
  compare-and-pick page, or both. *User floated both; inline first, deep page as Phase 6.*
- [RECOMMENDED: PHASE-GATED (Phase 5)] Methods representation: optional `methods[]` +
  keep `instructions[]` canonical (recommended) vs `methods[]`-only. *Recommend additive.*
- [RECOMMENDED: PHASE-GATED (Phase 7)] Publish scope: all 136 imported recipes + the 41
  fact updates, or a curated subset first. *Blast radius on the live starter feed.*

## Review Log

### Pass 1: Plan development — 2026-07-09
Built the base from the recipe-model-extensions memory + codebase grounding (lexicon def,
recipe.ts single-record load, view.ts render, import JSON shapes). Chose open-world additive
fields + `dishKey` grouping + `funFacts[]` + optional `methods[]`, all pending a Phase 0
PDS-validation probe. Surfaced 7 open questions (2 BLOCKING: lexicon strategy, grouping
mechanism). Sequential plan (UI phases share view.ts/recipe.ts). Migration for the 41 live
records + `pds-funfacts.json` scheduled in Phase 7.
