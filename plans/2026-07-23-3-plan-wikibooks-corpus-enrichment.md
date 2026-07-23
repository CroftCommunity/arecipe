# Wikibooks corpus enrichment: metadata crosswalks + Commons images (RUN-WIKIBOOKS-ENRICH / D15)

**Status:** ✅ Pass 1+2+3 complete 2026-07-23 — **ready for execution at Phase 2**
(no BLOCKING items). Phase 1 (category capture) implemented + green; D14 dishKey
stamp shipped. 16 phases; live Commons/PDS confirmed available here.

## Outcome Summary

| Phase | Status | Note |
|---|---|---|
| 1 Category capture | ✅ | `extractCategories` + `ir.categories[]`; snapshots regenerated |
| 2 Diet → suitableForDiet | ✅ | 739/3695 tagged; full defs refs; precision-first |
| 3 Category token | ✅ | 2607/3695; free-text passthrough removed |
| 3B Cuisine token | ✅ | 943/3695; sparse by design |
| 4 keywords[] | ✅ | 2577/3695; cap 12 + maintenance stoplist |
| 5 nutrition | ✅ | 95/3695 (energy sparse); kcal + kJ→kcal |
| 5B cookingMethod | ✅ | 1392/3695; inferred, precision-first |
| 5C Docs (metadata) | ✅ | MAPPING.md rows + README dishKey/enrichment |
| 6A/6B Nutrition UI (app) | ☐ | pending |
| 7 RateLimiter + uploadBlob | ☐ | pending |
| 8/8B/9 Image pipeline | ☐ | pending (Commons+PDS egress confirmed) |
| 10A/10B Orchestration + docs | ☐ | pending |

Metadata spine (Phases 1–5C) shipped in one commit on branch
`claude/wikibooks-enrichment` (cluster-commit cadence). Tool suite: 137 pass /
1 skip. D14 dishKey stamp is part of the same branch.

## Problem Statement

`wbsync` publishes each Wikibooks Cookbook recipe as name + text + ingredients +
instructions + provenance + (D14) `dishKey`, with `recipeCategory`/`recipeCuisine`
as **free text** and the infobox image captured as a filename only
(`image-unresolved`, images out of scope). The publish target
`arecipe.bsky.social` populates far more on its ~346 hand-authored records:
`suitableForDiet[]` (15/25 sampled), controlled category/cuisine **tokens**
(25/24 of 25), `keywords[]` (25/25), `embed` images (21/25).

Consequence: the corpus won't appear under arecipe's diet/category/cuisine facet
filters (they match controlled tokens, not free text), reads as text-only beside
image-rich recipes, and is less discoverable. The source data mostly exists —
diet + dietary categories in `[[Category:…]]` links (Phase 1 now captures them),
photos on Wikimedia Commons behind the infobox filename — it's just not mapped or
fetched. `nutrition` is a supported record field but **rendered nowhere** in the
app, so surfacing it needs new UI.

## Reasoning

- **Enrich at the two existing seams — `transform` (→ IR) and `buildRecord`
  (→ record) — not a post-processor.** Records are built in `stagePlan` via
  `buildRecord` (`src/run.ts:158`); the real publish path uses it. Stamping only
  in a spike post-processor would never reach published records (the D14 lesson).
  Crosswalk tables are **data inside the tool** → they satisfy O1 isolation, which
  forbids code imports across the tool boundary (`tests/o1-isolation.test.ts`),
  not data tables.
- **Capture categories before stripping (Phase 1, done).** Diet, dietary flags,
  and much category/keyword signal live in `[[Category:…]]` the transform
  discarded; surfacing them on `ir.categories` is the enabling step everything
  downstream consumes. Cheapest, lowest-risk → first.
- **Tokens, not free text.** The app facets on controlled tokens; free text is
  invisible to filters. Unmapped source values are **omitted from the token field
  and preserved in `keywords` + flagged** — nothing lost, nothing mis-faceted.
- **Pull, don't encode.** Zero-runtime-dep is a hard tool constraint (no image
  encoder). Commons renders scaled rendition URLs, so "web-optimized" is a
  server-side rendition ≤ 1 MB via `iiurlwidth`, not a local downscale.
- **Reuse the proven throttle.** `WikiTransport` already encodes the etiquette
  contract (concurrency=1, ≥1s spacing, maxlag, 429/Retry-After + exp backoff);
  extract it into a reusable limiter for Commons + PDS rather than three ad-hoc
  limiters. Honors the user's "throttle both" requirement.
- **Licensing is a correctness gate, not a nicety.** Publishing a non-free image
  as CC-BY-SA is a real rights error. Allowlist free-culture licenses
  (CC-BY/BY-SA/CC0/PD); skip + flag NC/ND/unknown. Owner-confirmed.
- **Nutrition is app work, gated separately.** Writing `nutrition` round-trips
  (open-world) but renders nowhere; value lands only once arecipe has a section
  (Phase 6). Kept independent so the corpus can ship without blocking on app UI.

### Alternatives rejected

- *Vendor the arecipe deriver / images-upload into the tool* — breaks O1
  isolation; mirror the shape instead (data + reimplemented-with-node-builtins).
- *Local image re-encode (sharp/ImageMagick)* — violates zero-dep; Commons
  renditions give web-optimized output for free.
- *Free-text category/cuisine with a fuzzy match at read time* — the app has no
  such matcher; tokens are the only thing faceting sees.

## Verified Assumptions

Confirmed by discovery agents + probes (file:line where cited):

- **On-record field forms** (`tests/fixtures/lexicons/canonical-lexicon.schema-record-exchange.recipe.recipe.json`;
  `knownValues` is advisory, not an enum — the PDS stores any string):
  - `suitableForDiet[]` = **full defs refs**, e.g. `"exchange.recipe.defs#dietVegetarian"`
    (writer `spike/import/publish-corpus.mjs:32`). App strips prefix on read
    (`src/pages/browse-state.ts:41`).
  - `recipeCategory` = **single bare lowercase word** (`"breakfast"`), token minus
    `category` prefix, lowercased (`spike/import/publish-corpus.mjs:83`).
  - `recipeCuisine` = **single bare lowercase word** (`"american"`).
  - `cookingMethod` = **single string** (schema forbids array); no existing
    writer → no proven convention; follow category form (bare lowercase).
  - `keywords[]` = free strings, **≤ 64 chars each**, no array cap.
  - `nutrition` = `{ calories:int, fatContent:num, proteinContent:num, carbohydrateContent:num }`,
    all optional, units not encoded.
- **Diet defs tokens** (`exchange.recipe.defs.json`): dietDiabetic, dietGlutenFree,
  dietHalal, dietKeto, dietKosher, dietLowCalorie, dietLowCarb, dietLowFat,
  dietPaleo, dietVegan, dietVegetarian. `dietDairyFree` is used by the app
  (`src/recipes/diet-preference.ts:32`) but is **NOT** in defs → open-world.
- **Corpus diet categories (all 3,824 pages, measured):** Vegetarian 290, Vegan
  196, Halal 76, Naturally-gluten-free 70 + Gluten-free 60, Kosher 26 + Kosher-for-
  Passover 18. So exactly 5 diet tokens are actually present: dietVegetarian,
  dietVegan, dietHalal, dietGlutenFree, dietKosher. (keto/paleo/dairy/low-* effectively absent.)
- **Category/cuisine vocab:** 15 `category*`, 33 `cuisine*` tokens in defs. Cuisine
  is **sparse** in the infobox → most records will have no cuisine token (→ keyword).
- **Embed image shape** (`canonical-lexicon…json`): `embed = { $type:'exchange.recipe.recipe#imagesEmbed', images:[…] }`, **max 4**.
  Each image `{ image:<blobRef>, alt:string(req), aspectRatio?:{width,height}, credit?:{artist,license,source} }`.
  blob ≤ **1,000,000 bytes**, `image/*`. `credit` is **open-world** (absent from
  lexicon) but rendered by `src/recipes/view.ts:233-269` (`artist · license`,
  links source, drops `artist === 'unknown'`). blobRef form
  `{ $type:'blob', ref:{$link:cid}, mimeType, size }`.
- **Commons image resolution** (`spike/import/attach-images.mjs`): `imageinfo`
  width ladder to the largest rendition ≤ 1 MB; `uploadBlob` posts raw bytes
  (`content-type:<mime>`, Bearer) to `com.atproto.repo.uploadBlob`; alt = recipe
  name; credit `{artist,license,source}` from `extmetadata`.
- **Commons egress CONFIRMED** (probe 2026-07-23, `commons.wikimedia.org/w/api.php`
  imageinfo with a proper User-Agent): `thumburl`/`thumbwidth`/`thumbheight`/`mime`/
  `size`/`extmetadata` all populate. Refinements the probe forced:
  - `extmetadata.LicenseShortName` = e.g. `"CC BY-SA 3.0"`, `"CC BY-SA 2.5"` →
    the allowlist must match CC-BY-SA **version-agnostically**.
  - `extmetadata.Artist` is **HTML** (`<a href=…>Name</a>`) → strip tags to a
    plain name for `credit.artist`.
  - `imageinfo.size` is the **ORIGINAL** file's bytes, **not** the thumbnail's
    (Chocolate-chip-cookies at `iiurlwidth=1024` returned a rendition >1 MB while
    `size` reflected the original). → the ≤1 MB gate must **measure the downloaded
    rendition bytes** and step down the ladder, not trust `size`.
- **Nutrition has NO app UI.** Grep of `src/` finds `nutrition` only as an import-
  parser stop-word (`src/import/recipe-text.ts:65`); nothing in `view.ts`/
  `present.ts`/`pages/recipe.ts` renders it. → Phase 6 is greenfield UI.
- **Throttle primitive:** `tools/wikibooks/src/http/transport.ts` `WikiTransport`
  = concurrency 1 (`withLock` single-tail promise), `MIN_GAP_MS=1000` spacing,
  `maxlag=5`, retry `MAX_ATTEMPTS=10`, 429/Retry-After + backoff
  `min(5min, 1000·2^n)`, 5xx → 15-min pause; injectable `(cfg, fetch, clock)`.
- **PDS client:** `tools/wikibooks/src/publish/http-pds.ts` `HttpPdsClient` has
  `connect/putRecord/deleteRecord/currentRev` — **NO `uploadBlob`**, **no
  throttle**; `xrpc` helper always JSON-encodes → cannot send raw bytes. Phase 7
  adds a raw-body `uploadBlob`.
- **Build site:** `buildRecord(ir, meta, cfg, opts)` (`src/publish/record.ts:100`)
  called at `src/run.ts:158`; `opts.dishKey` already threaded (D14). New fields
  extend `opts`/`ir` the same way.
- **IR snapshot suite** regenerates via `UPDATE_SNAPSHOTS=1`
  (`tests/d5-d8-snapshots.test.ts:17`) — any IR-shape change requires a regen
  step in-phase (Phase 1 did this).

## Documentation Impact

- `tools/wikibooks/MAPPING.md` — currently says images out of scope + token
  crosswalk deferred. Update the mapping table (diet/category/cuisine tokens,
  keywords, nutrition, embed images) — **Phase 10b**.
- `tools/wikibooks/STAND-INS.md` — register the crosswalk tables, the license
  allowlist, and the Commons rendition assumption — **Phase 10b**.
- `tools/wikibooks/README.md` — new `WIKIBOOKS_DISHKEY_MAP` (D14, add now) + new
  enrichment env/knobs + O4 target change — **Phase 10b**.
- `docs/LEXICONS.md` — note `dishKey`/`credit`/`dietDairyFree` are open-world
  extensions the corpus writes; no lexicon change — **Phase 10b** (verify: grep
  shows LEXICONS.md already lists the `wikibooks.*` extension block at line 98).
- arecipe `CHANGELOG` trailer — Phase 6 (nutrition section) is user-visible →
  needs a `Changelog(added):` trailer on that commit (per `CLAUDE.md`).
- No file renames/removals in the tool. dishKey map file
  `spike/wikibooks-dishkeys/wb-dishkeys.approved.json` already added (D14);
  grepped — referenced only by the D14 wiring + its README.

## Concurrency Map

```
Sequential spine (tool):
  Phase 1 (done) → 2 → 3 → 3B → 4 → 5 → 5B → 5C → 7 → 8 → 8B → 9 → 10A → 10B

Parallel opportunity:
  [ tool spine, Phases 2–5C ]  ||  [ app Phases 6A → 6B ]
```

**Why the tool spine is sequential:** Phases 2, 3, 3B, 4, 5, 5B, 9, 10A all edit
`src/publish/record.ts` and/or `src/run.ts` — a **shared write-set** — so by the
hard rule they cannot run in parallel with each other. The `enrich-*.ts` modules
are individually disjoint, but each phase also edits the shared record/run files,
so the spine stays sequential.

**Parallel set {tool-2…5B, app-6A/6B}:**
- **Disjoint write-sets:** tool phases write only under `tools/wikibooks/`; app
  phases 6A/6B write only `src/recipes/present.ts`, `src/recipes/view.ts`, and
  `tests/**` (vitest/e2e). No path overlap (the `o1-isolation` test *guarantees*
  the tool and `src/` never import each other).
- **Shared-state contract:** Both operate on the same git branch; if run as
  parallel worktrees, neither invokes `git checkout/stash/rebase` in the parent,
  binds no ports (app e2e uses Playwright's own ephemeral server), writes only
  under its own subtree + `$TMPDIR`. The arecipe app gate (Playwright) is the only
  process-heavy actor and is confined to phase 6B.
- **Re-entry verification:** parent-repo HEAD == pre-dispatch SHA; `git status`
  clean outside each worktree's subtree; no orphan `chromium`/node test procs.

Default is still **sequential execution**; the parallel split is opt-in and only
worth it if the app UI is done concurrently by a second worktree. For a single
executor, run the spine then Phase 6.

## Phases

> Every phase: RED test first, GREEN, commit. Tool phases run
> `npm test` in `tools/wikibooks/`; app phases run the arecipe gate
> (`npm run lint/typecheck/test:unit`, e2e via the `pw-local.config.ts` gotcha in
> `CLAUDE.md`). Max 3 files touched per phase (record.ts/run.ts count).
>
> **Health checkpoint after Phase 5C** (before the image pipeline): run a dry
> `wbsync run` over the staged corpus and eyeball the enrichment counts
> (diet/category/cuisine/keywords/nutrition/cookingMethod). Metadata is shippable
> on its own here — a natural rollback point before the heavier, network-touching
> image work.

### Phase 1: Capture categories in the IR — ✅ DONE
`extractCategories` (`src/transform/wikitext.ts`) + `ir.categories[]` (`src/ir.ts`)
+ transform wiring; snapshots regenerated; 113 pass/1 skip. Commit landed.

### Phase 2: Diet crosswalk → `suitableForDiet[]`
**Goal:** Corpus recipes carry diet tokens so they appear under arecipe diet facets.
**Changes:**
- [ ] `src/transform/enrich-diet.ts` [new] — table {Vegetarian→dietVegetarian,
  Vegan→dietVegan, Halal→dietHalal, (Naturally )Gluten-free→dietGlutenFree,
  Kosher(/for Passover)→dietKosher}; `dietRefs(categories): string[]` returns full
  `exchange.recipe.defs#…` refs, deduped, deterministic. Case/plural/underscore-tolerant.
- [ ] `src/publish/record.ts` [edit] — `record.suitableForDiet = dietRefs(ir.categories)` when non-empty.
- [ ] `tests/d15-diet.test.ts` [new].
**Call chain:** `stagePlan` → `buildRecord(ir,…)` → `dietRefs(ir.categories)` → `record.suitableForDiet`.
**Wiring test + boundaries:** `[[Category:Vegan recipes]]` → `suitableForDiet`
contains `exchange.recipe.defs#dietVegan`; **negative** — `[[Category:Dessert recipes]]`
(non-diet) → no diet ref; variants `vegan recipe`/`Vegan_recipe`/`Halal Recipe`
normalize to the same token; a recipe with Vegetarian + Halal → both refs, deduped.
**Depends on:** Phase 1. **Read-set:** ir.ts, enrich-diet.ts. **Write-set:** src/transform/enrich-diet.ts, src/publish/record.ts, tests/d15-diet.test.ts. **Shared-state:** none beyond files.
**Risks:** category name variants (singular/case/underscore — seen in histogram: "vegan recipe", "Vegan_recipe"). Normalize before lookup.
**Done when:** (1) a Vegan/Vegetarian/Halal/Gluten-free/Kosher recipe publishes with the right `suitableForDiet` refs; (2) `npm test` green incl. the wiring test.
**Validation:** Moderate — wiring + unit + spot-check `dietRefs` over the corpus category histogram (count how many of 3,824 get ≥1 diet token; expect ~500+).

### Phase 3: Category token → `recipeCategory`
**Goal:** `recipeCategory` becomes a controlled bare-lowercase token.
**Changes:**
- [ ] `src/transform/enrich-category.ts` [new] — crosswalk (infobox `summary.category`
  + `ir.categories`) → one `category*` token, lowercased-bare (e.g. `dessert`,
  `soup`, `breakfast`, `side`, `snack`, `entree`). Built from the corpus category
  histogram (derive in-phase, not guessed). Unmapped → `undefined` (+ push original to keywords in Phase 4) + flag `category-unmapped`.
- [ ] `src/publish/record.ts` [edit] — set `record.recipeCategory` to the token when mapped (replacing today's free-text passthrough).
- [ ] `tests/d15-category.test.ts` [new].
**Call chain:** `buildRecord` → `categoryToken(ir)` → `record.recipeCategory`.
**Wiring test:** a "Dessert"-category recipe → `record.recipeCategory === 'dessert'`.
**Depends on:** Phase 1. **Read-set:** ir.ts, enrich-category.ts. **Write-set:** src/transform/enrich-category.ts, src/publish/record.ts, tests/d15-category.test.ts. **Shared-state:** none.
**Risks:** Wikibooks categories are many + noisy; over-eager mapping mis-facets. Map only high-confidence entries; leave the rest unmapped.
**Done when:** (1) recipes with a recognizable meal category publish the bare token; unmapped keep no token + flag; (2) green.
**Validation:** Moderate — wiring + unit + corpus coverage count + a manual scan of the top-30 unmapped categories to confirm none were clear misses.

### Phase 3B: Cuisine token → `recipeCuisine`
**Goal:** `recipeCuisine` becomes a controlled bare-lowercase token where determinable.
**Changes:**
- [ ] `src/transform/enrich-cuisine.ts` [new] — crosswalk `summary.cuisine` +
  nationality categories (e.g. `[[Category:Ethiopian recipes]]`→? no cuisine token
  → keyword; `Peruvian`→`peruvian`) → one `cuisine*` token bare-lowercase. Sparse
  by design; unmapped → keyword + flag.
- [ ] `src/publish/record.ts` [edit].
- [ ] `tests/d15-cuisine.test.ts` [new].
**Call chain:** `buildRecord` → `cuisineToken(ir)` → `record.recipeCuisine`.
**Wiring test:** infobox `cuisine=Peruvian` → `record.recipeCuisine === 'peruvian'`.
**Depends on:** Phase 3 (shares record.ts). **Read-set:** ir.ts, enrich-cuisine.ts. **Write-set:** src/transform/enrich-cuisine.ts, src/publish/record.ts, tests/d15-cuisine.test.ts. **Shared-state:** none.
**Risks:** Cuisine mostly absent → most records get none. Acceptable (matches source). Don't invent cuisine from ingredients.
**Done when:** (1) recipes with a mappable cuisine publish the token; (2) green.
**Validation:** Moderate — wiring + unit + coverage count (expect low).

### Phase 4: `keywords[]`
**Goal:** Populate `keywords[]` for search/discovery, incl. spillover from unmapped category/cuisine.
**Changes:**
- [ ] `src/transform/enrich-keywords.ts` [new] — from leftover `ir.categories`
  (minus diet/meal categories already consumed) + notable title tokens; ≤64 chars
  each, deduped, capped (default 12), deterministic order.
- [ ] `src/publish/record.ts` [edit] — set `record.keywords`.
- [ ] `tests/d15-keywords.test.ts` [new].
**Call chain:** `buildRecord` → `keywordsFor(ir, consumedTokens)` → `record.keywords`.
**Wiring test:** an "Ethiopian"/"Recipes using X" recipe → keywords include `ethiopian`.
**Depends on:** Phases 2,3,3B (so consumed categories are excluded). **Read-set:** ir.ts, enrich-keywords.ts. **Write-set:** src/transform/enrich-keywords.ts, src/publish/record.ts, tests/d15-keywords.test.ts. **Shared-state:** none.
**Risks:** noise/over-long keywords → enforce cap + length + drop maintenance categories ("Recipes with…" boilerplate) via a stoplist.
**Done when:** (1) recipes publish a sensible deduped keyword set; (2) green.
**Validation:** Moderate — wiring + unit + manual scan of a sample for junk keywords.

### Phase 5: `nutrition{}` from infobox energy
**Goal:** Map infobox `energy` → `nutrition.calories` when parseable as kcal.
**Changes:**
- [ ] `src/transform/enrich-nutrition.ts` [new] — parse `summary.energy` (e.g.
  "250 kcal", "1046 kJ"→convert) → `{calories:int}`; conservative, omit when ambiguous + flag.
- [ ] `src/publish/record.ts` [edit] — set `record.nutrition` when non-empty.
- [ ] `tests/d15-nutrition.test.ts` [new].
**Call chain:** `buildRecord` → `nutritionFor(ir.summary.energy)` → `record.nutrition`.
**Wiring test + boundaries:** `energy=250 kcal` → `calories===250`; `energy=1046 kJ`
→ `calories===250` (kJ→kcal /4.184, rounded); `energy=` / "a lot" / non-numeric →
`nutrition` omitted (not `{calories:0}`) + flag. Assert the *absence* case, not just the happy path.
**Depends on:** Phase 1. **Read-set:** ir.ts, enrich-nutrition.ts. **Write-set:** src/transform/enrich-nutrition.ts, src/publish/record.ts, tests/d15-nutrition.test.ts. **Shared-state:** none.
**Risks:** energy is sparse + unit-heterogeneous; only calories is derivable (fat/protein/carb absent upstream). Keep scope to calories.
**Done when:** (1) recipes with a parseable energy publish `nutrition.calories`; (2) green.
**Validation:** Narrow-Moderate — wiring + unit; note expected low coverage.

### Phase 5B: `cookingMethod` (single token, conservative)
**Goal:** Stamp a single `cookingMethod` token when the title/category clearly implies one.
**Changes:**
- [ ] `src/transform/enrich-cookingmethod.ts` [new] — keyword map
  (baked/roast/grill/fried/steam/slow-cook/air-fry/no-cook/pressure/broil/sauté)
  from title + categories → one bare-lowercase token; **omit when ambiguous**.
- [ ] `src/publish/record.ts` [edit].
- [ ] `tests/d15-cookingmethod.test.ts` [new].
**Call chain:** `buildRecord` → `cookingMethodFor(ir)` → `record.cookingMethod`.
**Wiring test:** title "Baked Ziti" → `record.cookingMethod === 'baking'`.
**Depends on:** Phase 5 (shares record.ts). **Read-set:** ir.ts, enrich-cookingmethod.ts. **Write-set:** src/transform/enrich-cookingmethod.ts, src/publish/record.ts, tests/d15-cookingmethod.test.ts. **Shared-state:** none.
**Risks:** inference is lossy; a recipe with two methods, or a method word in a non-method sense ("no-bake" vs "bake"). Conservative single-token; omit on conflict.
**Done when:** (1) clearly-method recipes get one token, ambiguous get none; (2) green.
**Validation:** Moderate — wiring + unit + manual precision scan on a sample (favor precision over recall).

### Phase 5C: Docs sync — metadata mappings (tool)
**Goal:** Docs match the enriched *metadata* fields as soon as they exist (not
deferred to an end-of-plan docs lump — the metadata references go stale here).
**Changes:**
- [ ] `tools/wikibooks/MAPPING.md` [edit] — add rows for suitableForDiet /
  recipeCategory / recipeCuisine / keywords / nutrition / cookingMethod (drop the
  "token crosswalk deferred" note).
- [ ] `tools/wikibooks/README.md` [edit] — document the **already-stale D14**
  `WIKIBOOKS_DISHKEY_MAP` env + the new enrichment behavior.
**Depends on:** Phases 2–5B. **Read-set:** the two docs. **Write-set:**
tools/wikibooks/MAPPING.md, tools/wikibooks/README.md. **Shared-state:** none.
**Done when:** the mapping table + README describe the shipped metadata behavior;
no stale "deferred" claims for fields now implemented.
**Validation:** Narrow — proofread + grep for stale claims.

### Phase 6A: arecipe — expose nutrition in the presenter (APP)
**Goal:** A tested accessor for a record's nutrition, defensively read (open-world).
**Changes:**
- [ ] `src/recipes/present.ts` [edit] — `nutritionOf(value): {calories?…}|undefined`, reading defensively like `firstImageCredit`.
- [ ] `src/recipes/present.test.ts` (or nearest unit spec) [edit/new].
**Call chain:** recipe page → `present` → `nutritionOf(record.value)`.
**Wiring test:** unit — a record value with `nutrition.calories` → accessor returns it; absent → undefined.
**Depends on:** none (open-world; independent of tool). **Read-set:** src/recipes/present.ts. **Write-set:** src/recipes/present.ts, its unit test. **Shared-state:** none.
**Risks:** none significant (pure accessor).
**Done when:** (1) accessor returns nutrition when present; (2) `npm run test:unit` green.
**Validation:** Narrow — unit tests sufficient.

### Phase 6B: arecipe — render a Nutrition section in the recipe view (APP)
**Goal:** The recipe view shows a compact "Nutrition" section when data exists.
**Changes:**
- [ ] `src/recipes/view.ts` [edit] — render `nutritionOf(...)` (calories in kcal;
  fat/protein/carb in g if present) near recipeYield; omit section when absent.
- [ ] `tests/e2e/…nutrition.spec.ts` [new] — hermetic e2e asserting the section
  renders for a fixture with nutrition and is absent otherwise.
**Call chain:** `src/pages/recipe.ts` → `view.render` → nutrition section DOM.
**Wiring test:** the e2e spec (renders through the real page).
**Depends on:** Phase 6A. **Read-set:** src/recipes/view.ts, present.ts. **Write-set:** src/recipes/view.ts, tests/e2e/*nutrition*.spec.ts. **Shared-state:** Playwright ephemeral server (phase-local).
**Risks:** mobile-fit overflow (guard at 320/360/390 per `CLAUDE.md`); Playwright build-pin gotcha (`pw-local.config.ts`).
**Done when:** (1) a recipe with nutrition shows the section in the built app; recipes without it show nothing; (2) arecipe gate green (lint/typecheck/unit/build/e2e). Add `Changelog(added):` trailer.
**Validation:** Moderate — unit + hermetic e2e + eyeball via preview if a UI surface review is wanted.

### Phase 7: Reusable RateLimiter + `HttpPdsClient.uploadBlob`
**Goal:** One throttle primitive for Commons + PDS; PDS can upload raw blobs.
**Changes:**
- [ ] `src/http/rate-limiter.ts` [new] — extract WikiTransport's concurrency-1 +
  spacing + 429/Retry-After + backoff into an injectable limiter (`(fetch, clock, opts)`).
- [ ] `src/publish/http-pds.ts` [edit] — add `uploadBlob(bytes, mime): Promise<BlobRef>`
  (raw-body POST to `com.atproto.repo.uploadBlob`); route `putRecord`+`uploadBlob` through the limiter.
- [ ] `tests/d15-ratelimit-uploadblob.test.ts` [new] — fake fetch/clock: assert spacing, retry on 429, blob-ref shape.
**Call chain:** publish → `pds.uploadBlob` / `pds.putRecord` → limiter → fetch.
**Wiring test:** a fake PDS returning a blob → `uploadBlob` returns `{$type:'blob',ref:{$link},mimeType,size}`; two calls respect min spacing.
**Depends on:** none (infra). **Read-set:** src/http/transport.ts (as reference). **Write-set:** src/http/rate-limiter.ts, src/publish/http-pds.ts, tests/d15-ratelimit-uploadblob.test.ts. **Shared-state:** none (injected clock/fetch in tests).
**Risks:** don't refactor WikiTransport itself (avoid regressing the wiki path) — extract a parallel limiter and leave transport as-is for now.
**Done when:** (1) `uploadBlob` returns a valid blob ref and both write methods are throttled; (2) green.
**Validation:** Moderate — unit with fakes; live upload deferred (see Open Q).

### Phase 8: Throttled CommonsClient + license gate
**Goal:** Resolve an infobox image filename to a web-optimized rendition + credit, gated by license.
**Changes:**
- [ ] `src/images/commons-client.ts` [new] — `resolve(filename)`: `imageinfo`
  (`iiurlwidth` ladder [1200,1024,800,640,512,400,320], `extmetadata`) via the
  RateLimiter → `{ thumbUrl, width, height, mime, artist, licenseShort, sourceUrl } | skipped`.
  **Enforce ≤1 MB by the downloaded rendition's byte length** (probe found
  `imageinfo.size` is the original, not the thumb) — step down the ladder until a
  rendition fits. **Strip HTML from `extmetadata.Artist`** to a plain name.
- [ ] `src/images/license.ts` [new] — allowlist gate (accept CC-BY, CC-BY-SA, CC0,
  PD; skip NC/ND/unknown) mapping `extmetadata` license → accept/skip + reason.
- [ ] `tests/d15-commons.test.ts` [new] — fake fetch: ladder picks largest ≤1MB; license gate accepts/skips.
**Call chain:** images stage (8B) → `commons.resolve` → `license.accept`.
**Wiring test + boundaries (mutation-resistant):** fake imageinfo →
(a) CC-BY-SA 3.0 900 KB rendition → resolved with credit; (b) **the >1 MB
step-down edge** — width 1024 returns 1.1 MB, 800 returns 0.9 MB → resolver
picks the 800 rendition (the probe's actual failure mode); (c) license matrix:
`CC BY-SA 2.5`/`CC BY 4.0`/`CC0`/`Public domain` → accept; `CC BY-NC 3.0`/
`GFDL-only`/ND/empty/unknown → skip **with reason**; (d) HTML `Artist` →
stripped to plain name.
**Depends on:** Phase 7 (limiter). **Read-set:** rate-limiter.ts. **Write-set:** src/images/commons-client.ts, src/images/license.ts, tests/d15-commons.test.ts. **Shared-state:** Commons network (read-only) at run; tests use fake fetch.
**Risks:** `extmetadata` license strings are messy — map conservatively; unknown → skip. Commons egress from this sandbox unverified (Open Q → probe before running live).
**Done when:** (1) resolve returns a ≤1MB rendition + credit for free images, skip+flag otherwise; (2) green (fakes).
**Validation:** Broad — unit with fakes; a **live resolve** against a real Commons File: runs here (egress confirmed) to validate the end-to-end shape.

### Phase 8B: Image manifest stage (resumable, no PDS writes)
**Goal:** For each page with an infobox image, resolve + download the rendition to a local cache + manifest.
**Changes:**
- [ ] `src/images/stage.ts` [new] — `stageImages(ctx, pageids)`: for each page's
  `ir.summary.image`, `commons.resolve` → download bytes to `home/images/<pageid>`
  + write `images/manifest.json` entry `{pageid, blobPath, mime, alt, aspectRatio, credit}` or `{pageid, skipped, reason}`. Idempotent/resumable.
  **Observability:** progress line every N pages (`resolved/skipped/remaining`),
  and each skip/error carries a reason in the manifest — a mid-run failure is
  diagnosable from the manifest alone (which page, why).
- [ ] `src/run.ts` [edit] — add an `images` stage + `imagesDir` on RunContext; CLI `images` command.
- [ ] `tests/d15-image-stage.test.ts` [new] — fake commons client + fs temp: manifest written, resumable, skips recorded.
**Call chain:** `wbsync images` / `run` → `stageImages` → `commons.resolve` → cache + manifest.
**Wiring test:** run the images stage over 2 fake pages → manifest has 1 resolved + 1 skipped.
**Depends on:** Phase 8. **Read-set:** commons-client.ts, ir.ts. **Write-set:** src/images/stage.ts, src/run.ts, tests/d15-image-stage.test.ts. **Shared-state:** filesystem `home/images/` (phase-local dir).
**Risks:** big download volume (≤3,824 imgs) → throttled + resumable + capped concurrency=1. Disk usage (note in summary).
**Done when:** (1) `wbsync images` produces a manifest + cached renditions, resumable; (2) green (fakes).
**Validation:** Broad — unit with fakes, then a **live staged run** over the real corpus here (egress confirmed) — log how many resolved / skipped-by-license.

### Phase 9: Attach `embed` at publish (blob upload on --publish)
**Goal:** Records carry `embed` images; `--publish` uploads blobs, dry does not.
**Changes:**
- [ ] `src/publish/embed.ts` [new] — `buildEmbed(manifestEntry, blobRef): imagesEmbed` (alt, aspectRatio, credit; ≤4 images; `$type` set).
- [ ] `src/run.ts` [edit] — in publish path, for each planned item with a manifest
  entry: `pds.uploadBlob(bytes,mime)` → `buildEmbed` → set `record.embed`; skip if
  `embed` already present. Dry path records "would upload N".
  **Observability:** log each upload (pageid → cid) and each failure (pageid +
  error) so a partial publish is resumable and auditable; the run summary totals
  uploaded/failed/skipped-existing.
- [ ] `tests/d15-embed.test.ts` [new] — fake pds+manifest: embed assembled with credit; idempotent skip.
**Call chain:** `stagePublish` → per item → `uploadBlob` → `buildEmbed` → `record.embed` → `putRecord`.
**Wiring test:** fake manifest+pds → published record has `embed.images[0].{image,alt,credit}`.
**Depends on:** Phases 7, 8B. **Read-set:** manifest, http-pds.ts, embed.ts. **Write-set:** src/publish/embed.ts, src/run.ts, tests/d15-embed.test.ts. **Shared-state:** PDS (writes) on `--publish` only.
**Risks:** blob upload requires real creds → live path unexercisable here (Open Q). Idempotency: skip records with existing embed.
**Done when:** (1) dry reports would-upload counts; `--publish` (credentialed env) attaches embeds idempotently; (2) green (fakes).
**Validation:** Broad — unit with fakes here; live upload validated in a credentialed env against `arecipe.bsky.social`.

### Phase 10A: Orchestration, run-summary counts, config knobs + O4 target
**Goal:** Surface enrichment/image counts; make target + throttle configurable.
**Changes:**
- [ ] `src/config.ts` [edit] — O4 default `arecipe.bsky.social`; throttle knobs
  (spacing/concurrency) for Commons + PDS; license-allowlist config.
- [ ] `src/run.ts` [edit] — run summary counts: diet/category/cuisine/keywords/
  nutrition/cookingMethod stamped; images resolved / skipped-by-license / uploaded.
- [ ] `tests/d15-summary.test.ts` [new].
**Call chain:** `run` → `renderSummary` includes new counts.
**Wiring test:** a fake run → summary string includes "images: N resolved, M skipped (license)".
**Depends on:** Phases 2–9. **Read-set:** run.ts, config.ts. **Write-set:** src/config.ts, src/run.ts, tests/d15-summary.test.ts. **Shared-state:** none.
**Done when:** (1) summary reports all new counts; O4 target updated; (2) green.
**Validation:** Moderate — unit + a dry `run` over the staged corpus showing real counts.

### Phase 10B: Docs sync — image pipeline + O4 + final proofread
**Goal:** Docs match the *image pipeline* + config, and a final consistency sweep.
(Metadata docs already landed in Phase 5C — this covers what phases 7–10A made stale.)
**Changes:**
- [ ] `tools/wikibooks/MAPPING.md` [edit] — image pipeline + `embed` + license gate
  (drop "images out of scope").
- [ ] `tools/wikibooks/STAND-INS.md` [edit] — Commons rendition + license allowlist
  + throttle knobs + crosswalk tables register.
- [ ] `docs/LEXICONS.md` [edit] — note corpus-written open-world fields
  (dishKey/credit/dietDairyFree); no lexicon change.
- [ ] `tools/wikibooks/README.md` [edit] — O4 target + throttle/image env knobs.
**Depends on:** Phase 10A. **Read-set:** the docs. **Write-set:** MAPPING.md,
STAND-INS.md, docs/LEXICONS.md, README.md (doc-only phase; 4 files but zero code —
splitting trivial doc edits would be noise). **Shared-state:** none.
**Done when:** no stale "images out of scope" / "deferred" claims anywhere; O4 =
arecipe.bsky.social in docs.
**Validation:** Narrow — proofread + `grep -rn "out of scope\|deferred\|cookbook.arecipe.app" tools/wikibooks`.

## Open Questions

- [CONFIRMED: RESOLVED] Wikimedia Commons egress + PDS reachability — **both work
  in this environment.** Commons imageinfo probed live 2026-07-23 (egress OK, full
  shape). Live `--publish` blob upload runs here too; it needs the
  `arecipe.bsky.social` app-password (`WIKIBOOKS_PUBLISH_APP_PASSWORD`, operator-
  supplied — Claude never enters it) and, being an outward-facing write, is
  confirmed with the user before the real run. No sandbox blocker. Phases 8/8B/9
  are fully exercisable end-to-end here.
- [CONFIRMED: ADVISORY] `cookingMethod` inference — **precision-first**: stamp only
  on an unambiguous method keyword, omit on ambiguity/conflict (e.g. "no-bake").
- [CONFIRMED: ADVISORY] `keywords[]` — **cap 12**, drop maintenance categories
  ("Recipes using…", "Recipes with metric units", "Featured recipes", etc.).
- [CONFIRMED: ADVISORY] Nutrition section — **compact row near `recipeYield`**,
  kcal for calories, g for macros, section hidden when no data.
- [CONFIRMED: ADVISORY] CC-BY / CC-BY-SA attribution — satisfied by the rendered
  `credit{artist,license,source}` overlay; no stricter treatment required.

## Review Log

### Pass 1: Develop — 2026-07-23
Built the full plan from the Phase-0 discovery (two research agents + probes) and
the shipped D14 dishKey work. Established Verified Assumptions with citations,
Documentation Impact, Concurrency Map, and 15 phases (≤3 files each) with
call-chains, wiring tests, and two-tier Done-when. Owner decisions (licenses,
nutrition-UI, keywords+cookingMethod, O4) folded into Reasoning as settled.

### Pass 2: Gap Analysis — 2026-07-23
**Found:**
- Crosswalks were sized from the fixture sample, not the corpus. **Ran the full
  3,824-page diet-category histogram** (Vegetarian 290/Vegan 196/Halal 76/GF 130/
  Kosher 44) → diet crosswalk is exactly 5 tokens; category/cuisine crosswalks must
  be derived in-phase from the corpus, not guessed. Added derivation steps to
  Phases 2/3/3B and a "coverage count" validation to each.
- Original single "metadata" and "images" phases each touched 5+ files → **split**
  to honor the 4-file rule: images → Phase 7 (limiter+uploadBlob) / 8 (commons+
  license) / 8B (manifest) / 9 (embed); nutrition → 5 (record) + 6A/6B (app).
  cuisine split from category (3B); cookingMethod split from nutrition (5B).
- `HttpPdsClient` has **no `uploadBlob`** and its `xrpc` helper can't send raw
  bytes → added as explicit Phase 7 work (was implicit).
- IR-shape changes need `UPDATE_SNAPSHOTS=1` regen (Phase 1 confirmed this) —
  noted as a per-phase step for any future IR field.
- `dietDairyFree` is **not** a defs token (app-only) → documented as open-world;
  corpus has ~no dairy-free categories anyway, so it's not in the Phase 2 table.
**Concurrency:**
- Tool spine is sequential — Phases 2,3,3B,4,5,5B,9,10A share `record.ts`/`run.ts`
  (shared write-set) → cannot parallelize. Surfaced one real parallel opportunity:
  **app Phases 6A/6B ‖ tool spine** (disjoint write-sets `src/recipes/**` vs
  `tools/wikibooks/**`, guaranteed by the o1-isolation test); added write-sets,
  shared-state invariants, and re-entry checks. Default remains sequential.
**Changed:**
- Rewrote to the full phase-plan template; added Verified Assumptions, Documentation
  Impact, Concurrency Map, per-phase Read/Write/Shared-state, two-tier Done-when,
  Validation, and Open Questions with severities.
**Egress probe (2026-07-23):**
- User corrected the sandbox-egress assumption — **Commons + PDS both reachable
  here.** Probed `commons.wikimedia.org` imageinfo live: egress OK, full shape.
  Downgraded Open Q #1 from PHASE-GATED to RESOLVED. Probe forced three Phase-8
  refinements: license match must be CC-BY-SA **version-agnostic**; `Artist` is
  **HTML** (strip tags); `imageinfo.size` is the **original** not the thumb, so
  the ≤1 MB gate measures **downloaded rendition bytes** and steps down the ladder.
  Live `--publish` still needs the operator-supplied app-password + a
  confirm-before-write.
**Confirmed:**
- Enrich-at-buildRecord approach and O1-isolation-via-data-tables hold. buildRecord
  call site (`run.ts:158`) + opts extension pattern (D14) verified. Field forms +
  embed shape + throttle primitive + nutrition-has-no-UI all confirmed against
  `tests/fixtures/lexicons/`, `spike/import/*`, `src/recipes/*` at cited lines.

### Pass 3: Quality Gates — 2026-07-23
**TDD ordering:** Every phase already starts test-first with a named wiring test
+ two-tier Done-when; confirmed. No reordering needed.
**Mutation resistance:** Strengthened single-point specs into boundary/negative
tests — Phase 2 (non-diet category → no ref; case/plural variants; multi-diet
dedupe), Phase 5 (kJ→kcal + unparseable→omitted, assert the absence case),
Phase 8 (the >1 MB step-down edge from the live probe; full accept/skip license
matrix; HTML-artist strip). Same edge-not-just-happy-path expectation carries to
Phases 3/3B/4/5B at execution.
**Observability:** Added per-item logging + manifest-based diagnosability to
Phase 8B (progress + skip reasons) and Phase 9 (upload cid / failure), so a
partial network run is resumable and auditable; run summary totals in 10A.
**Debugging readiness:** Added a **health checkpoint after Phase 5C** — dry run
+ eyeball metadata counts before the image pipeline; metadata is independently
shippable (clean rollback point). Commit-per-phase + resumable image manifest are
the other checkpoints.
**Validation calibration:** Per-phase Validation present and scoped
(Narrow/Moderate/Broad); external-integration phases (8/8B/9) are Broad with live
runs (egress confirmed), not "tests sufficient". No change needed.
**Concurrency honesty:** Map accounts for all phases; re-checked write-set
disjointness after inserting 5C — tool spine still shares record.ts/run.ts/docs
(sequential); app {6A→6B} ‖ spine holds (disjoint subtrees, o1-isolation
guaranteed), shared-state stated as invariants, re-entry checks concrete. Map
confirmed.
**Documentation impact:** Caught the end-of-plan "docs phase" anti-pattern —
**split into Phase 5C** (metadata mappings + the already-stale D14 README, right
after the metadata spine) and **Phase 10B** (image pipeline + O4 + final sweep,
after the image work). Docs now land when their references go stale.
**Coherence:** Plan still solves the stated problem; scope matches owner
decisions (no creep). All 5 open questions user-confirmed (1 resolved, 4 advisory).
**Confirmed ready:** yes — no BLOCKING items; execution can start at Phase 2.

## Non-goals

Local image re-encoding (use Commons renditions); mapping every free-text category
to a token (unmapped → keywords + flag); backfilling images onto the existing
hand-authored corpus (this run only touches `wb-*` records); refactoring
`WikiTransport` (extract a parallel limiter instead).
