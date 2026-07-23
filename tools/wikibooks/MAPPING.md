# Record mapping & the lexicon gap (D9/D10)

How the wikibooks IR maps onto the **consumed** `exchange.recipe.recipe` record.
Per arecipe policy (`docs/LEXICONS.md`), `exchange.recipe.*` is owned by
recipe.exchange; this run **does not extend that lexicon**. Fields with a lexicon
home are mapped; fields without one ride in **open-world** fields recipe.exchange
ignores. This is the gap report the brief asks for — not papered over.

## Mapped to lexicon fields

| IR | record field | notes |
|----|--------------|-------|
| `title` | `name` | Cookbook: prefix stripped, ≤255 |
| `lead` (or generated) | `text` | required description, ≤3000 |
| `ingredients[].display` | `ingredients[]` | `(optional)` appended when flagged; ≤500 each |
| `procedure` (flattened) | `instructions[]` | substeps kept as `— …` lines; ≤1000 each |
| `summary.yield` / `servings` | `recipeYield` | yield preferred |
| `summary.category` + dish-type categories | `recipeCategory` | **controlled `category*` token, bare-lowercase** (e.g. `dessert`); unmapped → omitted (→ keywords) (D15) |
| `summary.cuisine` + nationality categories | `recipeCuisine` | **controlled `cuisine*` token, bare-lowercase** (e.g. `peruvian`); sparse; unmapped → omitted (→ keywords) (D15) |
| dietary `[[Category:…]]` | `suitableForDiet[]` | **full defs refs** `exchange.recipe.defs#diet*` (Vegetarian/Vegan/Halal/GlutenFree/Kosher) (D15) |
| leftover categories | `keywords[]` | base word of `<X> recipes`, minus diet/consumed/maintenance; ≤64 chars, cap 12 (D15) |
| `summary.energy` | `nutrition.calories` | kcal, or kJ→kcal; omitted when unparseable (D15) |
| title / categories | `cookingMethod` | single bare token, inferred precision-first, omitted when ambiguous (D15) |
| approved map | `dishKey` | operator-supplied via `WIKIBOOKS_DISHKEY_MAP` (D14); groups versions of one dish |
| `summary.timeMinutesHint` | `totalTime` | ISO-8601 duration |
| provenance | `attribution` → `#attributionWebsite` | name/url/notes (licence + permalink) |
| `revTimestamp` | `createdAt` / `updatedAt` | deterministic → idempotent republish |

## Open-world provenance fields (D9) — top level

`sourceUrl` (reuses the existing arecipe provenance field), `sourcePermalink`,
`sourceRevId`, `sourceHistoryUrl`, `retrievedAt`, `license` `{id, token,
attribution}`.

## Open-world `wikibooks` object — fields with NO lexicon home

`pageid`, `difficulty`, `servings`, `servingsHint`, `image` (filename only —
images out of scope), `origin`, `energy`, `note`, `parseFlags[]`.

**The gap:** `difficulty` and `servings` in particular have no home in
`exchange.recipe.recipe`. RUN-RECIPE-META-STRIP is expected to decide where
servings/difficulty ultimately live; until then they are carried, losslessly, in
`wikibooks.*` so no source signal is dropped. **`recipeCategory`/`recipeCuisine`
are now controlled tokens** (D15 crosswalks in `src/transform/enrich-*.ts`);
values that don't map to a token are omitted from the token field and preserved
as `keywords` rather than published as mis-facetable free text. `raw image` is
still filename-only here — the Commons image pipeline (D15 Phases 7–9) resolves it
to an `embed`; see the enrichment plan.

## rkey

`wb-<pageid>` — deterministic, never a TID. Determinism is what makes the
six-month rerun idempotent and a rename an update (same rkey) instead of an
orphan + create.
