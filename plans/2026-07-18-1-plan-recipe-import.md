# Recipe import from a link (Alchemy) — layered acquisition + parse ladder

**Status:** DONE (2026-07-18). All 5 phases landed TDD (red→green); full gate green
(lint · typecheck · 648 unit · build · 197 e2e). Findings F1–F7 below drove the design.

## Run summary (red → green per phase)

- **P1 JSON-LD extractor.** Fixture corpus `tests/fixtures/import/` (10 pages: plain, @graph,
  @type-array, instructions-string, HowToStep[], HowToSection[], legacy `ingredients`,
  entities+tags, multiple-scripts, no-recipe). RED `tests/unit/import/jsonld.spec.ts` (14) →
  GREEN `src/import/recipe-jsonld.ts` + `src/import/sanitize.ts`. Clamp + tag-strip proven.
- **P2 text heuristic.** RED `text-heuristic.spec.ts` (6) → GREEN `src/import/recipe-text.ts`.
  Confidence gate (≥3 ingredient-run), partial + no-recipe cases, no fabrication.
- **P3 acquisition + panel.** RED `acquire.spec.ts` (10) + `panel.spec.ts` (7) → GREEN
  `src/import/acquire.ts` (injected fetch, timeout, taxonomy, sourceUrl in every path) +
  `src/import/panel.ts` (house inline-panel idiom) wired into `src/pages/mine.ts`.
- **P4 draft handoff + lexicon.** RED `to-fields.spec.ts` (4) + provenance/model specs → GREEN
  `src/import/to-fields.ts` (D3 map), `sourceUrl` on `EditorFields`/`RecipeRecordOut` +
  `isoDurationToMinutes` (`write.ts`), `sourceUrlOf` accessor (`model.ts`), LEXICONS.md
  extension row, editor provenance + single etiquette line (`src/import/provenance.ts`).
- **P5 e2e + closeout.** `tests/e2e/recipe-import.spec.ts` (6): URL import lands a prefilled
  draft in the editor (nothing published); CORS-abort expands paste → page-source imports;
  plain-text paste imports via heuristic; no-recipe paste shows honest error; partial import
  leaves the missing side blank; panel + textarea fit ≤390px. Throwaway `pw-local.config.ts`
  used for the Chromium pin mismatch, then removed.

### Fixture inventory
`tests/fixtures/import/*.html` — 10 handcrafted pages (see P1). Text-heuristic + acquire +
panel pastes are inline in their specs.

### [verify-in-run] outcomes
- **EditorFields shape / draft-open path** (F3): editor opens `editor.html?draft=<id>` →
  `drafts.get` → `fillFields`. Import saves via `draftStore.save(fields, undefined, 'draft')`
  then redirects there. Confirmed by e2e.
- **Lexicon-evolution convention** (D5/F1): `sourceUrl` added as an **open-world extension
  field** on the *consumed* `exchange.recipe.recipe` (recipe.exchange-owned — not amended),
  matching the `dishKey`/`funFacts` precedent: additive, optional, readers tolerate absence,
  defensive `sourceUrlOf` accessor. Registered in LEXICONS.md.
- **CSP** (F4): built `connect-src` includes `https:`; our own policy permits the direct
  cross-origin fetch — the obstacle is the remote site's CORS, exactly as framed. `no-cors`
  never used.

### D5 etiquette copy (for owner review)
> "Imported as a starting point — before publishing, consider writing the instructions in your
> own words."
Shown once in the editor for any draft carrying `sourceUrl`, sitting just above the Save/Publish
row. Provenance line: "Imported from &lt;host&gt;" (links to the source), shown at the top.

### Deferred (unchanged from below)
recipeCuisine/recipeCategory/suitableForDiet import (no editor field — F2), microdata, image
import, Web Share Target, bulk import, rating/dedupe.

---


## Mission

On Alchemy (`mine.html`), a cook pastes a recipe URL and gets a prefilled LOCAL DRAFT that opens
in the editor for review. Nothing publishes without the normal editor flow. Acquisition is
LAYERED: try a direct `fetch(url, {mode:'cors'})`; on failure (the common case — recipe sites
don't send CORS headers) fall back to a paste flow. Parse ladder: JSON-LD (schema.org/Recipe) →
pasted-text heuristic. The UI states the serverless friction honestly.

## Phase 0 findings (drift from the run file's 2026-07-16 snapshot)

- **F1 — Lexicon ownership.** The recipe record is `exchange.recipe.recipe`, **owned by
  recipe.exchange, not arecipe** (`docs/LEXICONS.md` ownership policy: we do NOT amend that
  lexicon unilaterally; we add *open-world extension fields*). D5 says add `sourceUrl` "to the
  recipe lexicon" — the honest repo-correct form is an **open-world extension field** on
  `exchange.recipe.recipe`, exactly like `dishKey`/`funFacts`: a defensive accessor in
  `src/recipes/model.ts` + a row in the LEXICONS.md extension table + fixture coverage.
  (mealsPerDay, cited in the run file, lives on arecipe-owned `app.arecipe.mealPlan`; the
  dishKey/funFacts extension fields are the right precedent for a field on the *consumed* record.)
- **F2 — No facet fields in the editor.** `EditorFields` = `{name, text, ingredients,
  instructions, prepMinutes?, totalMinutes?, recipeYield?}`. There are NO
  recipeCuisine/recipeCategory/suitableForDiet fields in `EditorFields` or the editor UI.
  Resolution: D3 maps into what exists — `prepTime→prepMinutes`, `totalTime→totalMinutes`
  (ISO-8601 duration → minutes), `recipeYield→recipeYield`. Importing
  recipeCuisine/recipeCategory/suitableForDiet is **DEFERRED** (no editor field to hold them;
  hidden un-editable draft state would violate "never fabricate" + scope honesty). Recorded in
  the Deferred list.
- **F3 — Draft-open path.** Editor opens an existing draft via `editor.html?draft=<id>` →
  `drafts.get(id)` → `fillFields`. Import handoff = `draftStore.save(fields, undefined, 'draft')`
  then redirect to `./editor.html?draft=<newId>`. Matches D5.
- **F4 — CSP allows the fetch.** Built CSP `connect-src` includes `https:`; the direct
  cross-origin fetch is permitted by our own CSP — the genuine obstacle is the remote site's CORS
  response, exactly as D1 frames it. `no-cors` (opaque) is never used.
- **F5 — sourceUrl on EditorFields.** Add optional `sourceUrl?: string` to `EditorFields`
  (`src/recipes/write.ts`); the draft store round-trips the whole fields object automatically.
  `buildRecipeRecord` emits it as an extension field when present; the editor shows a provenance
  line + a single etiquette line at publish when `sourceUrl` is set.
- **F6 — Panel idiom.** The house inline-panel idiom is the danger-zone style
  (`src/account/danger-zone.ts`): a `section.panel`-ish block whose controls `replaceChildren()`
  to expand; testids per control; `<p class="status">` for feedback. The import panel mirrors it.
- **F7 — Bundle safety.** Import modules are imported only by `mine.ts`/`editor.ts`; the browse
  bundle (`index.html`) is untouched (nav.spec.ts guard). Parser modules are pure & auth-free —
  zero new runtime dependencies.

## Design (locked, adjusted for findings)

- **Modules (all pure cores, injectable deps):**
  - `src/import/sanitize.ts` — entity-decode + tag-strip (via injectable DOMParser, inert doc) +
    clamp to lexicon maxima (name 255, text 3000, ingredient 500, instruction 1000).
  - `src/import/recipe-jsonld.ts` — JSON-LD Recipe extractor → `ImportedRecipe | null`.
  - `src/import/recipe-text.ts` — pasted-text heuristic → `ImportedRecipe` (partial-tolerant).
  - `src/import/acquire.ts` — layered fetch + ladder + error taxonomy; maps `ImportedRecipe` →
    `EditorFields` (+ `sourceUrl`).
- **`ImportedRecipe`** (schema.org-close): `{ name?, text?, ingredients: string[],
  instructions: string[], recipeYield?, prepTime?, totalTime? }`. Deferred facets not carried.
- **Error taxonomy:** `could-not-fetch` (CORS/network/timeout) → expands paste flow;
  `no-recipe-found` (fetched/pasted but no Recipe); `partial` (one bucket empty — imports with the
  missing side flagged, never fabricated).
- **Provenance:** `sourceUrl` retained in every path; surfaces in the editor.

## Deferred (recorded)

Microdata/itemprop extraction; image import (blob-upload complexity + third-party photo rights);
recipeCuisine/recipeCategory/suitableForDiet import (no editor field — F2); Web Share Target
registration; bulk import; rating/dedupe.

## Phases

- P1 JSON-LD extractor (fixtures first) — `tests/fixtures/import/`, `tests/unit/import/jsonld.spec.ts`.
- P2 Text heuristic — `tests/unit/import/text-heuristic.spec.ts`.
- P3 Acquisition + panel — `tests/unit/import/acquire.spec.ts` + mine.ts panel + DOM specs.
- P4 Draft handoff + lexicon — mapping, save-then-open, sourceUrl extension field + LEXICONS row.
- P5 e2e + closeout — hermetic same-origin fixture routing; mobile-fit; run summary.

_Outcome recorded at completion._
