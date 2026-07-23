# RUN: import hardening (deterministic parse ladder)

The shippable outcome of `docs/EXP-IMPORT-EXTRACTION.md` (Arm 1). Extends the
import parse ladder to the structured formats a page-source paste hits when it
carries no usable JSON-LD — **microdata, RDFa, and the h-recipe microformat** —
plus JSON-LD `recipeYield`-shape gaps. Parser-only: no new page, lexicon record,
network origin, CSP entry, model, or runtime dependency. Works on every device;
the model arm (Arm 2) was deferred (see the experiment doc's go/no-go).

Branch: `claude/import-extraction-exp-re1khh`. TDD-first: each rung became a
failing test over a committed fixture before implementation. Ordered below by
**measured corpus conversion value** (the experiment's per-item delta), not by
tidiness.

## Why this exists (Phase 0, one line)

Of 41 real recipe URLs probed, **0 of 10 reachable documents allow a cross-origin
browser fetch** (no `Access-Control-Allow-Origin`) — the URL rung is closed
in-browser, so **paste / shared-`text` is the import surface**. Hardening the
ladder that runs over pasted page-source is therefore the whole game. Full
evidence: `docs/EXP-IMPORT-EXTRACTION.md`.

## What landed, ordered by conversion delta

Corpus usable-draft rate rose **59% → 94%**; every structured-but-not-JSON-LD row
converted; nothing regressed. Measured by
`tests/unit/import/corpus-report.spec.ts` →
`tools/import-experiment/corpus/conversion-report.md`.

1. **Microdata extraction** (3 rows converted) — `src/import/recipe-dom.ts`
   `extractRecipeFromMicrodata`. Finds the `[itemscope][itemtype~=schema.org/Recipe]`
   root and reads `itemprop` name/ingredients/instructions/yield/times, taking a
   `<time>`'s `content`/`datetime` for ISO durations. **Nested-scope exclusion:**
   an `itemprop` whose nearest `[itemscope]` ancestor is not the recipe root
   (e.g. an embedded `Review`/`Person`) is skipped, so a reviewer's name can't leak
   into the ingredients. Fixtures: `microdata-recipe.html`,
   `microdata-nested-scope.html`, `non-english-microdata.html`.
2. **h-recipe microformat** (2 rows) — `extractRecipeFromMicroformats`. `.h-recipe`
   (v2 `p-name`/`p-ingredient`/`e-instructions`/`p-yield`) and legacy `.hrecipe`
   (v1 `fn`/`ingredient`/`instructions`). `e-instructions` blocks split into steps
   by child `<li>`/`<p>` then newlines. Fixtures: `hrecipe-recipe.html`,
   `hrecipe-v1.html`.
3. **RDFa extraction** (1 row) — `extractRecipeFromRdfa`. `[typeof~=Recipe]` root
   under a schema.org `vocab`; `property` matched on suffix so `recipeIngredient`
   and `schema:recipeIngredient` both count; nested `typeof` scopes excluded.
   Fixture: `rdfa-recipe.html`.
4. **JSON-LD `yield`-shape hardening** (field-level: yield P/R 88% → 100%) —
   `src/import/recipe-jsonld.ts` `readYield` now also reads the legacy `yield` key
   and a `QuantitativeValue` object (`{value, unitText}` → `"6 servings"`).

All four decode entities, strip stray tags, and clamp to the lexicon maxima via
the same `src/import/sanitize.ts` path the JSON-LD rung uses.

## Share-accuracy pass (the main use case: a direct share carries TEXT)

A share delivers visible text (a selection / article body / OS-OCR'd photo text),
**not** the page's JSON-LD/microdata — so for the share path the **text heuristic
is the whole accuracy story**, and the structured rungs above only help a
page-source paste. This pass hardened the text heuristic for real shared text and
threaded the OS-provided title:

- **`src/import/recipe-text.ts`** — strips site chrome ("Jump to Recipe",
  "Print", star-rating lines, `Course:`/`Cuisine:` chips), reads prose metadata
  (`Serves 4`, `Prep Time: 15 minutes`, `Total Time: 1 hour 30 minutes` → ISO),
  keeps ingredient sub-headings (`For the sauce:` → `— For the sauce`), accepts
  informal unlabeled steps **after a valid ingredient block** (gated so pure prose
  still yields nothing), and trims trailing junk (Nutrition / Comments / "you
  might also like"). The conservative core (≥3-ingredient confidence gate, no
  fabrication) is unchanged — `text-heuristic.spec.ts` (6) still green.
- **`src/import/share-target.ts` + `src/import/to-fields.ts`** — the shared page
  **title** is carried through as a name signal and fills the recipe name when
  extraction found none (never overrides a structured-data name). A blank title,
  or one that merely repeats the URL, is dropped.
- **`src/import/acquire.ts`** — the "can't read this link" copy now steers the
  user to the accurate action: *select the recipe text on the page and share that,
  or paste it below.*

**Measured effect** (`corpus-report.spec.ts`): the informal chat-paste row
(`paste-message`) that failed both ladders before now **converts** — the real
share-residual win. And because the hardened text path now also reads the visible
text of microdata/RDFa/h-recipe pages, the structured-DOM extractors are re-cast
as a **precision** layer (correct yield, and excluding an embedded review the text
path would otherwise leak — the `microdata-nested` row is the clean usable-flip)
rather than a usable/not-usable coverage flip.

Tests: `text-heuristic-share.spec.ts` (5), `share-target.spec.ts` (+2),
`to-fields.spec.ts` (+3), plus the reframed `corpus-report.spec.ts` (3).

## Ladder wiring

`src/import/acquire.ts` `runLadder` gains one rung between JSON-LD and text:

```
JSON-LD  →  DOM-structured (microdata → RDFa → h-recipe)  →  visible-text heuristic
```

`extractRecipeFromDom` tries the three in that order and returns the first useful
result. Deterministic order is preserved: a page with JSON-LD never reaches the
new rung, so nothing about existing imports changes.

## Tests (RED → GREEN)

- `tests/unit/import/recipe-dom.spec.ts` (11) — microdata (incl. nested-scope
  exclusion + entity/tag decode), RDFa (incl. prefixed property), h-recipe v2 + v1,
  and the combined `extractRecipeFromDom` order/negative cases.
- `tests/unit/import/jsonld.spec.ts` (+2) — `yield` key and `QuantitativeValue`.
- `tests/unit/import/corpus-report.spec.ts` (3) — regression guard: Arm 1 never
  scores below the deployed ladder, recovers every microdata/RDFa/h-recipe row,
  and lifts the aggregate usable rate.
- Existing `acquire`/`panel`/`share-target`/`recipe-import` (e2e) unchanged and
  green — the new rung is additive.

Full import suite: **105 unit tests green**; `lint`, `typecheck`, `build`, and the
`recipe-import` e2e (7) all pass. (Per `CLAUDE.md`, e2e ran via the throwaway
`pw-local.config.ts` Chromium-pin workaround, then removed.)

## Fixture inventory (committed corpus)

`tests/fixtures/import/` gains: `microdata-recipe.html`,
`microdata-nested-scope.html`, `rdfa-recipe.html`, `hrecipe-recipe.html`,
`hrecipe-v1.html`, `non-english-microdata.html`, `cookbook-paste.txt`,
`message-paste.txt`, `prose-blog.html`, `consent-wall.html`,
`js-rendered-empty.html` — alongside the 10 original JSON-LD fixtures.

## Deferred (recorded)

- **Informal-text paste** (`paste-message` corpus row) — the one addressable
  residual after Arm 1: loosen the text heuristic to accept unlabeled/lowercase
  step lines. Deterministic, all-devices; a natural next follow-up.
- **Arm 2 (desktop model)** — built and safety-gated (`src/import/verbatim.ts`,
  `src/import/model-extract.ts`) but not shipped; see the experiment doc.
- Prose-only recipes and consent/JS-render ceilings — no extractor helps.
- Image import; `recipeCuisine`/`recipeCategory`/`suitableForDiet` (no editor
  field) — unchanged from the original import plan's deferred list.
